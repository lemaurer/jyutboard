import * as Y from "yjs";
import type { Presence } from "./model";
export function toBase64(value: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 8192)
    binary += String.fromCharCode(...value.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export class LiveSync {
  private pending: Uint8Array[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private closed = false;
  private attempt = 0;
  private ready = false;
  private latest?: Presence;
  constructor(
    private doc: Y.Doc,
    private room: string,
    private url: string,
    private id: string,
    private onStatus: (s: string) => void,
    private onPresence: (p: Presence | null, id?: string) => void,
  ) {
    doc.on("update", this.update);
    this.connect();
    this.heartbeat = setInterval(() => {
      if (this.latest) this.presence(this.latest);
    }, 5000);
  }
  private send(message: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  private update = (update: Uint8Array, origin: unknown) => {
    if (origin === this || !this.ready) return;
    this.pending.push(update);
    this.flushTimer ??= setTimeout(() => {
      const updates = this.pending;
      this.pending = [];
      this.flushTimer = undefined;
      if (this.ready && updates.length)
        this.send({
          type: "update",
          update: toBase64(Y.mergeUpdates(updates)),
        });
    }, 16);
  };
  private connect() {
    if (this.closed) return;
    this.onStatus(this.attempt ? "Reconnecting…" : "Connecting…");
    this.ready = false;
    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.onStatus("Invalid relay address");
      return;
    }
    this.socket.onopen = () =>
      this.send({ type: "join", room: this.room, id: this.id });
    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "sync") {
          Y.applyUpdate(this.doc, fromBase64(message.update), this);
          this.send({
            type: "sync",
            update: toBase64(Y.encodeStateAsUpdate(this.doc)),
          });
          this.ready = true;
        } else if (message.type === "ready") {
          this.attempt = 0;
          this.onStatus("Live");
          if (this.latest) this.presence(this.latest);
        } else if (message.type === "update")
          Y.applyUpdate(this.doc, fromBase64(message.update), this);
        else if (message.type === "presence") this.onPresence(message.presence);
        else if (message.type === "leave") this.onPresence(null, message.id);
      } catch {
        this.onStatus("Sync error — local lesson preserved");
      }
    };
    this.socket.onclose = (event) => {
      this.ready = false;
      if (this.closed) return;
      if (event.code === 1008 || event.code === 1009) {
        this.onStatus("Relay rejected lesson — local copy preserved");
        return;
      }
      this.onStatus("Offline · retrying");
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(15000, 500 * 2 ** this.attempt++),
      );
    };
    this.socket.onerror = () => this.onStatus("Offline · retrying");
  }
  presence(value: Presence) {
    this.latest = value;
    if (this.ready) this.send({ type: "presence", presence: value });
  }
  destroy() {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.flushTimer);
    this.pending = [];
    clearInterval(this.heartbeat);
    this.doc.off("update", this.update);
    this.socket?.close();
  }
}
