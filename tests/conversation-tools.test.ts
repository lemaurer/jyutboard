import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import {
  addCard,
  createCard,
  createTableRow,
  readCards,
  tableRowSchema,
} from "../src/model";
import {
  nextSpeaker,
  speakerSide,
  splitSentences,
  splitConversationTurn,
  splitPhraseCard,
} from "../src/conversationTools";
import { inputLanguage, phraseInput } from "../src/phraseInput";
import { lessonServiceError, pairedServiceBody } from "../src/serviceErrors";

test("continuous tonal Jyutping converts locally and keeps a complete canonical phrase", async () => {
  assert.equal(inputLanguage("ngo5soeng2jam2seoi2", "chinese"), "jyutping");
  const result = await phraseInput("ngo5 soeng2 jam2 seoi2", "jyutping");
  assert.equal(result.chinese, "我想飲水");
  assert.ok(result.jyutping.includes("ngo5"));
  assert.ok(result.definition.includes("water"));
  assert.ok(result.words.length > 0);
});
test("paired credentials accompany analysis and speech even when the desktop has a token; publication never borrows them", () => {
  for (const action of ["analyze", "transcribe", "recognize", "vocabulary"])
    assert.deepEqual(pairedServiceBody({ action, text: "test" }, "room"), {
      room: "room",
      action,
      text: "test",
    });
  assert.deepEqual(pairedServiceBody({ action: "publish" }, "room"), {
    action: "publish",
  });
  assert.equal(
    pairedServiceBody({ action: "analyze", room: "explicit" }, "saved").room,
    "explicit",
  );
  assert.match(
    lessonServiceError("Missing Bearer Token", 401),
    /host desktop.*external request token.*rejoin/i,
  );
  assert.match(
    lessonServiceError("Could not verify this lesson"),
    /registered|expired/,
  );
  assert.equal(lessonServiceError("Microphone blocked"), "Microphone blocked");
});
test("sentence boundaries preserve decimal numbers, abbreviations, quotes and final fragments", () => {
  assert.deepEqual(
    splitSentences("Dr. Lee paid 3.5 dollars. 好！「多謝。」\n再見"),
    ["Dr. Lee paid 3.5 dollars.", "好！", "「多謝。」", "再見"],
  );
  assert.deepEqual(splitSentences("你好！\n我想飲水。"), [
    "你好！",
    "我想飲水。",
  ]);
});
test("next speaker follows observed dialogue, custom identities and manual changes; side belongs to a person", () => {
  const rows = [
    createTableRow({ persona: "Leif", avatar: "leif" }),
    createTableRow({ persona: "Barista", avatar: "amira" }),
    createTableRow({ persona: "Barista", avatar: "amira" }),
  ];
  assert.deepEqual(nextSpeaker(rows), { name: "Leif", avatar: "leif" });
  assert.equal(speakerSide(rows, rows[1]), "right");
  assert.equal(speakerSide(rows, rows[2]), "right");
  rows.push(createTableRow({ persona: "Leif", avatar: "leif" }));
  assert.deepEqual(nextSpeaker(rows), { name: "Barista", avatar: "amira" });
  assert.equal(
    tableRowSchema.parse(createTableRow({ emotion: undefined })).emotion,
    "neutral",
  );
});
test("conversation splitting preserves aligned edits, speaker/expression, source, recording, order and atomic undo", () => {
  const doc = new Y.Doc();
  const row = createTableRow({
    chinese: "你好！我想飲水。",
    jyutping: "nei5 hou2! ngo5 soeng2 jam2 seoi2.",
    definition: "Hi! I want water.",
    persona: "Natasha",
    avatar: "natasha",
    emotion: "happy",
    starred: true,
    audio: "data:audio/webm;base64,YWJj",
    note: "Remember tones",
    receipt: "created",
  });
  const card = createCard({
    kind: "conversation",
    rows: [row, createTableRow({ chinese: "好" })],
  });
  addCard(doc, card);
  const undo = new Y.UndoManager(doc.getMap("cards"));
  const turns = splitConversationTurn(doc, card, row);
  assert.equal(turns.length, 2);
  const saved = readCards(doc)[0].rows;
  assert.deepEqual(
    saved.map((r) => r.chinese),
    ["你好！", "我想飲水。", "好"],
  );
  assert.equal(saved[0].definition, "Hi!");
  assert.equal(saved[1].definition, "I want water.");
  assert.equal(saved[0].id, row.id);
  assert.equal(saved[0].receipt, "");
  assert.equal(saved[1].emotion, "happy");
  assert.equal(saved[1].avatar, "natasha");
  assert.equal(saved[1].audio, undefined);
  assert.equal(saved[0].audioName, "Full original recording");
  assert.equal(saved[0].splitSource?.definition, row.definition);
  undo.undo();
  assert.equal(readCards(doc)[0].rows[0].chinese, row.chinese);
  assert.equal(readCards(doc)[0].rows.length, 2);
  doc.destroy();
});
test("phrase splitting leaves manual obstacles alone, keeps links on first card and synchronizes new fields", () => {
  const doc = new Y.Doc(),
    remote = new Y.Doc();
  const card = createCard({
    chinese: "你好。多謝。",
    definition: "Hello. Thanks.",
    x: 100,
    y: 100,
  });
  const obstacle = createCard({ chinese: "水", x: 100, y: 260 });
  addCard(doc, card);
  addCard(doc, obstacle);
  const pieces = splitPhraseCard(doc, card, readCards(doc));
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0].id, card.id);
  assert.ok(pieces[1].y >= 424);
  assert.deepEqual(
    readCards(doc).find((c) => c.id === obstacle.id),
    obstacle,
  );
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
  assert.deepEqual(readCards(remote), readCards(doc));
  doc.destroy();
  remote.destroy();
});
