import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMode,
  parseInvite,
  strokeSchema,
  createCard,
  readCards,
  addCard,
} from "../src/model";
import { inkOutline } from "../src/ink";
import * as Y from "yjs";
test("old card modes migrate to three modes without losing lesson content", () => {
  const doc = new Y.Doc();
  for (const mode of [
    "full",
    "compact",
    "peek",
    "characters",
    "breakdown",
    "inline",
    "practice",
  ] as const)
    addCard(
      doc,
      createCard({
        mode,
        chinese: "你好",
        audio: "data:audio/mp4;base64,YQ==",
      }),
    );
  assert.deepEqual(
    new Set(readCards(doc).map((c) => c.mode)),
    new Set(["full", "peek", "practice"]),
  );
  assert.ok(readCards(doc).every((c) => c.chinese === "你好" && c.audio));
  assert.equal(normalizeMode("full", true), "practice");
});
test("web invitations carry strong room capabilities in a fragment and reject invalid relay credentials", () => {
  const room = "a".repeat(48);
  assert.deepEqual(
    parseInvite(
      `https://jyutboard.vercel.app/#room=${room}&relay=wss%3A%2F%2Frelay.example.com`,
    ),
    { room, relay: "wss://relay.example.com" },
  );
  assert.throws(() =>
    parseInvite(
      `https://jyutboard.vercel.app/#room=${room}&relay=wss%3A%2F%2Fu%3Ap%40host`,
    ),
  );
});
test("pressure-sensitive ink is backward-compatible and rejects invalid pressure in imported drawings", () => {
  const stroke = {
    id: "ink",
    points: [
      [100, 100],
      [120, 105],
      [150, 110],
    ] as [number, number][],
    color: "#3159e8",
    arrow: false,
    width: 8,
  };
  assert.ok(strokeSchema.safeParse(stroke).success);
  assert.ok(
    strokeSchema.safeParse({ ...stroke, pressures: [0.2, 0.5, 1] }).success,
  );
  assert.ok(!strokeSchema.safeParse({ ...stroke, pressures: [2] }).success);
  assert.notEqual(
    inkOutline({ ...stroke, pressures: [0.2, 0.3, 0.4] }),
    inkOutline({ ...stroke, pressures: [0.8, 0.9, 1] }),
  );
});
