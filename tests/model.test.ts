import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  addCard,
  addTableRow,
  createCard,
  createTableRow,
  deleteTableRow,
  patchCard,
  patchTableRow,
  readCards,
  newRoom,
  parseInvite,
  inviteFor,
  queuePayload,
  parseReceipts,
  cardSchema,
} from "../src/model";
import { analyzeLocal, initializeDictionary } from "../src/language";
import { readFileSync } from "node:fs";
initializeDictionary(
  JSON.parse(
    readFileSync(new URL("../public/dictionary.js", import.meta.url), "utf8")
      .replace("globalThis.JYUTBOARD_DICTIONARY=", "")
      .replace(/;\s*$/, ""),
  ),
);

test("Cantonese lookup gives Jyutping and meaningful multi-character words offline", () => {
  const result = analyzeLocal("我想飲水。");
  assert.match(result.jyutping, /ngo5 soeng2 jam2 seoi2/);
  assert.equal(result.definition, "I would like some water.");
  assert.ok(result.words.some((w) => w.definition.includes("drink")));
  const advanced = analyzeLocal("圖書館");
  assert.ok(advanced.words.some((w) => w.definition.includes("library")));
});
test("separate card fields survive concurrent offline edits and converge", () => {
  const a = new Y.Doc(),
    b = new Y.Doc();
  const card = createCard({ chinese: "你好" });
  addCard(a, card);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  patchCard(a, card.id, { x: 300, starred: true });
  patchCard(b, card.id, {
    definition: "Hello!",
    audio: "data:audio/webm;base64,YQ==",
  });
  const au = Y.encodeStateAsUpdate(a),
    bu = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bu);
  Y.applyUpdate(b, au);
  assert.deepEqual(readCards(a), readCards(b));
  assert.equal(readCards(a)[0].x, 300);
  assert.equal(readCards(a)[0].definition, "Hello!");
  assert.equal(readCards(a)[0].starred, true);
  a.destroy();
  b.destroy();
});
test("deleted cards do not reappear from stale reconnects", () => {
  const a = new Y.Doc(),
    b = new Y.Doc();
  const card = createCard();
  addCard(a, card);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  a.getMap("cards").delete(card.id);
  patchCard(b, card.id, { definition: "late edit" });
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
  assert.equal(readCards(a).length, 0);
  a.destroy();
  b.destroy();
});
test("invites round trip and reject invalid protocols, credentials, and weak room codes", () => {
  const room = newRoom();
  const invite = inviteFor(room, "wss://relay.example.com");
  assert.deepEqual(parseInvite(invite), {
    room,
    relay: "wss://relay.example.com",
  });
  assert.throws(() => parseInvite("https://example.com"));
  assert.throws(() => inviteFor("guessable", "wss://relay.example.com"));
  assert.throws(() => inviteFor(room, "file:///tmp/test"));
  assert.throws(() => inviteFor(room, "ws://user:password@host"));
});
test("queue requests use the documented envelope and do not pretend to upload audio", () => {
  const card = createCard({
    chinese: "我想飲水",
    audio: "data:audio/webm;base64,YQ==",
    starred: true,
    savedBy: "teacher",
    syncState: "pending",
  });
  const session = { id: newRoom(), title: "Tea time", created: Date.now() };
  const payload = queuePayload([card], session);
  assert.equal(payload.requests[0].chinese, card.chinese);
  assert.equal(payload.requests[0].metadata.hasLessonRecording, true);
  assert.equal(payload.requests[0].metadata.sourceRole, "teacher");
  assert.equal(payload.requests[0].metadata.teacherApproved, true);
  assert.match(payload.requests[0].idempotencyKey, /:teacher:/);
  assert.equal(JSON.stringify(payload).includes("data:audio"), false);
  assert.deepEqual(payload, queuePayload([card], session));
});
test("HTTP 207 receipts retain failed and conflicting items, and missing entries fail closed", () => {
  const receipts = parseReceipts(
    {
      results: [
        { index: 2, status: "conflict", message: "changed fields" },
        { index: 0, status: "created", id: "abc" },
        { index: 1, status: "failed" },
      ],
    },
    4,
  );
  assert.deepEqual(receipts, [
    "created",
    "failed",
    "conflict: changed fields",
    "failed: Missing or ambiguous queue receipt",
  ]);
});
test("invalid peer data cannot inject arbitrary playable URLs or infinite coordinates", () => {
  assert.equal(
    cardSchema.safeParse(
      createCard({ audio: "https://evil.example/track", x: Infinity }),
    ).success,
    false,
  );
  const doc = new Y.Doc();
  doc.getMap("cards").set("bad", { x: Infinity });
  assert.deepEqual(readCards(doc), []);
  doc.destroy();
});
test("old cards open with appearance defaults", () => {
  const legacy = createCard({ chinese: "你好" });
  delete (legacy as unknown as Record<string, unknown>).mode;
  delete (legacy as unknown as Record<string, unknown>).shape;
  delete (legacy as unknown as Record<string, unknown>).rows;
  delete (legacy as unknown as Record<string, unknown>).hideEnglishForLearner;
  const parsed = cardSchema.parse(legacy);
  assert.equal(parsed.mode, "full");
  assert.equal(parsed.shape, "rounded");
  assert.deepEqual(parsed.rows, []);
});
test("table rows and independent edits sync without replacing each other", () => {
  const a = new Y.Doc(),
    b = new Y.Doc();
  const card = createCard({
    kind: "table",
    rows: [createTableRow({ chinese: "飲水", definition: "drink water" })],
  });
  addCard(a, card);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const row = card.rows[0];
  patchTableRow(a, card.id, row.id, { note: "At the restaurant" });
  patchTableRow(b, card.id, row.id, { definition: "Have a drink" });
  const au = Y.encodeStateAsUpdate(a),
    bu = Y.encodeStateAsUpdate(b);
  Y.applyUpdate(a, bu);
  Y.applyUpdate(b, au);
  assert.deepEqual(readCards(a), readCards(b));
  assert.equal(readCards(a)[0].rows[0].note, "At the restaurant");
  assert.equal(readCards(a)[0].rows[0].definition, "Have a drink");
  const next = createTableRow({ chinese: "食飯" });
  addTableRow(a, card.id, next);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  assert.equal(readCards(b)[0].rows.length, 2);
  deleteTableRow(b, card.id, row.id);
  assert.equal(readCards(b)[0].rows[0].id, next.id);
  a.destroy();
  b.destroy();
});

test("English and Jyutping cards retain their source language in queue requests", () => {
  const session = { id: newRoom(), title: "Practice", created: Date.now() };
  for (const card of [
    createCard({
      sourceLanguage: "english",
      definition: "Would you like tea?",
      note: "Polite question",
    }),
    createCard({ sourceLanguage: "jyutping", jyutping: "nei5 hou2" }),
  ]) {
    const request = queuePayload([card], session).requests[0];
    assert.equal(request.inputLanguage, card.sourceLanguage);
    assert.equal(
      request.requestText,
      card.sourceLanguage === "english" ? card.definition : card.jyutping,
    );
    assert.equal(request.chinese, undefined);
  }
});
test("undo changes local edits while preserving a remote edit on the same card", () => {
  const doc = new Y.Doc(),
    peer = new Y.Doc();
  const card = createCard({ chinese: "你好" });
  addCard(doc, card);
  Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
  const manager = new Y.UndoManager(doc.getMap("cards"));
  patchCard(doc, card.id, { x: 500 });
  patchCard(peer, card.id, { note: "Natasha’s hint" });
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), "remote");
  manager.undo();
  assert.equal(readCards(doc)[0].x, card.x);
  assert.equal(readCards(doc)[0].note, "Natasha’s hint");
  manager.redo();
  assert.equal(readCards(doc)[0].x, 500);
  manager.destroy();
  doc.destroy();
  peer.destroy();
});
