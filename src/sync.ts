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
  private presenceTimer?: ReturnType<typeof setTimeout>;
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
    // Latest-value backpressure: never queue a trail of stale pointer frames.
    this.presenceTimer ??= setTimeout(() => {
      this.presenceTimer = undefined;
      if (
        this.ready &&
        this.latest &&
        (this.socket?.bufferedAmount ?? 0) < 64000
      ) {
        const value = { ...this.latest };
        // The existing relay has a 6 KB presence limit. Keep cursor/ink/motion
        // together bounded, even for long phrases and large selected groups.
        while (JSON.stringify(value).length > 5800) {
          if (value.draft) value.draft = "";
          else if (value.ink && value.ink.stroke.points.length > 8) {
            const indices = value.ink.stroke.points
              .map((_, i) => i)
              .filter((i, _, all) => i % 2 === 0 || i === all.length - 1);
            value.ink = {
              ...value.ink,
              stroke: {
                ...value.ink.stroke,
                points: indices.map((i) => value.ink!.stroke.points[i]),
                pressures: value.ink.stroke.pressures
                  ? indices.map((i) => value.ink!.stroke.pressures![i])
                  : undefined,
              },
            };
          } else if (value.laser && value.laser.points.length > 8)
            value.laser = {
              ...value.laser,
              points: value.laser.points.filter(
                (_, i, all) => i % 2 === 0 || i === all.length - 1,
              ),
            };
          else if (value.move?.strokes?.length)
            value.move = {
              ...value.move,
              strokes: value.move.strokes.slice(0, -1),
            };
          else if (value.move && value.move.cards.length > 1)
            value.move = {
              ...value.move,
              cards: value.move.cards.slice(0, -1),
            };
          else break;
        }
        if (JSON.stringify(value).length <= 5800)
          this.send({ type: "presence", presence: value });
      }
    }, 32);
  }
  destroy() {
    this.closed = true;
    clearTimeout(this.timer);
    clearTimeout(this.flushTimer);
    clearTimeout(this.presenceTimer);
    this.pending = [];
    clearInterval(this.heartbeat);
    this.doc.off("update", this.update);
    this.socket?.close();
  }
}
