import { get } from "node:https";
import { WebSocket } from "ws";
import { spawn } from "node:child_process";
import { join } from "node:path";
import * as Y from "yjs";
import { startRelay } from "../electron/relay-server";
import { LiveSync } from "../src/sync";
import {
  newRoom,
  addCard,
  createCard,
  patchCard,
  readCards,
} from "../src/model";
// Match the desktop's encrypted DNS path for newly created room addresses.
const addresses = new Map<string, string[]>();
const lookup = (
  hostname: string,
  options: { all?: boolean },
  callback: Function,
) => {
  void (async () => {
    let records = addresses.get(hostname);
    if (!records) {
      const response = await fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(3000),
        },
      );
      const data = await response.json();
      records = (data.Answer ?? [])
        .filter((record: { type: number }) => record.type === 1)
        .map((record: { data: string }) => record.data);
      if (!records?.length) throw Error("Tunnel DNS is not ready yet");
      addresses.set(hostname, records);
    }
    if (options.all)
      callback(
        null,
        records.map((address) => ({ address, family: 4 })),
      );
    else callback(null, records[0], 4);
  })().catch((error) => callback(error));
};
class PublicSocket extends WebSocket {
  constructor(url: string) {
    super(url, { lookup });
  }
}
globalThis.WebSocket = PublicSocket as unknown as typeof globalThis.WebSocket;
function health(url: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = get(url, { lookup }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(3000, () => request.destroy(Error("Health timeout")));
    request.on("error", reject);
  });
}
async function main() {
  const relay = await startRelay(0, "127.0.0.1");
  const child = spawn(
    join(
      process.cwd(),
      ".vendor/cloudflared",
      process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
    ),
    [
      "tunnel",
      "--url",
      `http://127.0.0.1:${relay.port}`,
      "--protocol",
      "http2",
      "--no-autoupdate",
    ],
  );
  let output = "",
    address = "",
    stopped = false;
  const scan = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-20000);
    address =
      output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0] ?? address;
  };
  child.stdout.on("data", scan);
  child.stderr.on("data", scan);
  child.on("exit", () => (stopped = true));
  child.on("error", () => (stopped = true));
  async function until(predicate: () => boolean, timeout = 12000) {
    const start = Date.now();
    while (!predicate()) {
      if (Date.now() - start > timeout) throw Error("Remote sync timed out");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  const a = new Y.Doc(),
    b = new Y.Doc();
  let alice: LiveSync | undefined, bob: LiveSync | undefined;
  try {
    await until(() => Boolean(address) || stopped, 45000);
    if (stopped) throw Error("Tunnel failed to start");
    let healthy = false;
    let healthError = "";
    const deadline = Date.now() + 45000;
    while (!healthy && Date.now() < deadline) {
      try {
        healthy = await health(`${address}/health`);
      } catch (error) {
        healthError = String(error);
      }
      if (!healthy) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!healthy)
      throw Error(
        "Tunnel was not reachable: " +
          address +
          " " +
          healthError +
          " " +
          output.slice(0, 2200),
      );
    const room = newRoom();
    let as = "",
      bs = "";
    let present = false;
    alice = new LiveSync(
      a,
      room,
      address.replace("https:", "wss:"),
      "teacher",
      (s) => (as = s),
      () => {},
    );
    bob = new LiveSync(
      b,
      room,
      address.replace("https:", "wss:"),
      "learner",
      (s) => (bs = s),
      (p) => {
        if (p?.view?.zoom === 0.8 && p.presenting) present = true;
      },
    );
    await until(() => as === "Live" && bs === "Live");
    const card = createCard({ chinese: "你好", jyutping: "nei5 hou2" });
    addCard(a, card);
    await until(() => readCards(b).length === 1);
    const times: number[] = [];
    for (let index = 0; index < 8; index++) {
      const start = Date.now();
      patchCard(a, card.id, { x: 2800 + index });
      await until(() => readCards(b)[0].x === 2800 + index);
      times.push(Date.now() - start);
    }
    alice.presence({
      id: "teacher",
      role: "teacher",
      at: Date.now(),
      x: 3000,
      y: 1800,
      view: { x: 3000, y: 1800, zoom: 0.8 },
      presenting: true,
    });
    await until(() => present);
    console.log(
      `Public WSS test passed: two clients, card edits and presenter camera. Median edit delivery ${times.sort((a, b) => a - b)[4]} ms.`,
    );
  } finally {
    alice?.destroy();
    bob?.destroy();
    child.kill();
    a.destroy();
    b.destroy();
    await relay.close();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
