import { test } from "node:test";
import assert from "node:assert/strict";
import { vocabularyState, wordKey } from "../src/VocabularyPhrase";
import {
  createCard,
  createTableRow,
  cardSchema,
  conversationPhrase,
  queuePayload,
} from "../src/model";
test("verified JyutDeck states override local guesses, known wins over queue and unavailable is not new", () => {
  const snapshot = {
    known: ["你好！"],
    queued: ["飲", "你好"],
    at: Date.now(),
  };
  const word = {
    chinese: "你好",
    jyutping: "nei5 hou2",
    definition: "hello",
    state: "new" as const,
  };
  assert.equal(vocabularyState(word, snapshot), "known");
  assert.equal(vocabularyState({ ...word, chinese: "飲" }, snapshot), "queued");
  assert.equal(vocabularyState({ ...word, chinese: "食" }, snapshot), "new");
  assert.equal(vocabularyState({ ...word, state: undefined }), "unknown");
  assert.equal(wordKey(" 你好！"), "你好");
});
test("conversation personas and paired table text round-trip without losing fields", () => {
  const card = createCard({
    kind: "conversation",
    rows: [
      createTableRow({
        persona: "Waiter",
        avatar: "friend",
        chinese: "飲咩？",
        answerChinese: "奶茶",
        answerJyutping: "naai5 caa4",
      }),
    ],
  });
  const parsed = cardSchema.parse(card);
  assert.equal(parsed.rows[0].persona, "Waiter");
  assert.equal(parsed.rows[0].answerChinese, "奶茶");
  assert.equal(parsed.tableStyle, "minimal");
});

test("conversation bubbles become stable queue phrases with their own saved state and hidden meaning", () => {
  const row = createTableRow({
    chinese: "飲水",
    jyutping: "jam2 seoi2",
    definition: "drink water",
    starred: true,
    mode: "practice",
    receipt: "created",
  });
  const conversation = createCard({ kind: "conversation", rows: [row] });
  const bubble = conversationPhrase(conversation, row);
  assert.equal(bubble.id, row.id);
  assert.equal(bubble.starred, true);
  assert.equal(bubble.mode, "practice");
  assert.equal(bubble.receipt, "created");
  const request = queuePayload([bubble], {
    id: "room",
    title: "Dialogue",
    created: 1,
  }).requests[0];
  assert.equal(request.chinese, "飲水");
  assert.equal(request.metadata.cardId, row.id);
  assert.equal(cardSchema.parse(conversation).rows[0].starred, true);
});
