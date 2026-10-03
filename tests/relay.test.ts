import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { startRelay } from "../electron/relay-server";
import { LiveSync } from "../src/sync";
import {
  addCard,
  createCard,
  newRoom,
  patchCard,
  readCards,
} from "../src/model";
async function until(predicate: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > ms)
      throw Error("Timed out waiting for synchronization");
    await new Promise((r) => setTimeout(r, 20));
  }
}
test("two clients sync cards, recordings and simultaneous edits; reconnect merges offline edits", async () => {
  const relay = await startRelay(0, "127.0.0.1");
  const url = `ws://127.0.0.1:${relay.port}`;
  const room = newRoom();
  const a = new Y.Doc(),
    b = new Y.Doc();
  let as = "",
    bs = "";
  const alice = new LiveSync(
    a,
    room,
    url,
    "teacher",
    (s) => (as = s),
    () => {},
  );
  let bob = new LiveSync(
    b,
    room,
    url,
    "learner",
    (s) => (bs = s),
    () => {},
  );
  try {
    await until(() => as === "Live" && bs === "Live");
    const card = createCard({ chinese: "你好" });
    addCard(a, card);
    await until(() => readCards(b).length === 1);
    patchCard(a, card.id, { audio: "data:audio/webm;base64,YQ==" });
    patchCard(b, card.id, { starred: true });
    await until(
      () => readCards(a)[0].starred && Boolean(readCards(b)[0].audio),
    );
    bob.destroy();
    patchCard(b, card.id, { definition: "offline change" });
    patchCard(a, card.id, { x: 770 });
    bs = "";
    bob = new LiveSync(
      b,
      room,
      url,
      "learner",
      (s) => (bs = s),
      () => {},
    );
    await until(
      () =>
        bs === "Live" &&
        readCards(a)[0].definition === "offline change" &&
        readCards(b)[0].x === 770,
    );
    assert.deepEqual(readCards(a), readCards(b));
  } finally {
    alice.destroy();
    bob.destroy();
    a.destroy();
    b.destroy();
    await relay.close();
  }
});
test("room contents never broadcast to another room", async () => {
  const relay = await startRelay(0, "127.0.0.1");
  const a = new Y.Doc(),
    b = new Y.Doc();
  let sa = "",
    sb = "";
  const url = `ws://127.0.0.1:${relay.port}`;
  const aa = new LiveSync(
      a,
      newRoom(),
      url,
      "a",
      (s) => (sa = s),
      () => {},
    ),
    bb = new LiveSync(
      b,
      newRoom(),
      url,
      "b",
      (s) => (sb = s),
      () => {},
    );
  try {
    await until(() => sa === "Live" && sb === "Live");
    addCard(a, createCard({ chinese: "secret lesson" }));
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(readCards(b).length, 0);
  } finally {
    aa.destroy();
    bb.destroy();
    a.destroy();
    b.destroy();
    await relay.close();
  }
});
test("relay rejects unauthenticated updates and malformed rooms without crashing", async () => {
  const relay = await startRelay(0, "127.0.0.1");
  try {
    for (const message of [
      { type: "update", update: "evil" },
      { type: "join", room: "123", id: "x" },
    ]) {
      const socket = new WebSocket(`ws://127.0.0.1:${relay.port}`);
      await new Promise<void>((resolve) =>
        socket.once("open", () => resolve()),
      );
      socket.send(JSON.stringify(message));
      const code = await new Promise<number>((resolve) =>
        socket.once("close", resolve),
      );
      assert.equal(code, 1008);
    }
  } finally {
    await relay.close();
  }
});

test("connector references, illustrated stickers and resized cards converge across a live room", async () => {
  const relay = await startRelay(0, "127.0.0.1");
  const room = newRoom(),
    a = new Y.Doc(),
    b = new Y.Doc();
  let sa = "",
    sb = "";
  const url = `ws://127.0.0.1:${relay.port}`;
  const aa = new LiveSync(
    a,
    room,
    url,
    "a",
    (s) => (sa = s),
    () => {},
  );
  const bb = new LiveSync(
    b,
    room,
    url,
    "b",
    (s) => (sb = s),
    () => {},
  );
  try {
    await until(() => sa === "Live" && sb === "Live");
    const phrase = createCard({
      chinese: "你好",
      mode: "characters",
      width: 310,
    });
    const sticker = createCard({
      kind: "sticker",
      sticker: "noodles",
      width: 180,
      height: 180,
    });
    a.transact(() => {
      addCard(a, phrase);
      addCard(a, sticker);
      a.getMap("connectors").set("connection", {
        id: "connection",
        from: phrase.id,
        to: sticker.id,
        color: "#3159e8",
        width: 2,
      });
    });
    await until(
      () => readCards(b).length === 2 && b.getMap("connectors").size === 1,
    );
    patchCard(b, sticker.id, { x: 1200, width: 240, height: 240 });
    await until(
      () => readCards(a).find((card) => card.id === sticker.id)?.width === 240,
    );
    assert.deepEqual(readCards(a), readCards(b));
    assert.deepEqual(
      a.getMap("connectors").toJSON(),
      b.getMap("connectors").toJSON(),
    );
    b.getMap("connectors").delete("connection");
    await until(() => a.getMap("connectors").size === 0);
  } finally {
    aa.destroy();
    bb.destroy();
    a.destroy();
    b.destroy();
    await relay.close();
  }
});
