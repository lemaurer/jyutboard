import * as Y from "yjs";
import { analyzeLocal } from "./language";
import {
  addCard,
  createCard,
  createTableRow,
  patchCard,
  replaceTableRow,
  type Card,
  type TableRow,
} from "./model";
import { estimatedBox } from "./lessonTools";
import { intersects, type Box } from "./canvasGeometry";
export type Speaker = { name: string; avatar: string };
const identity = (name: string) => name.trim().toLocaleLowerCase();
export function conversationSpeakers(rows: TableRow[]): Speaker[] {
  const people = new Map<string, Speaker>();
  for (const row of rows)
    if (row.persona.trim())
      people.set(identity(row.persona), {
        name: row.persona,
        avatar: row.avatar,
      });
  return [...people.values()];
}
/** Prefer a previously observed reply to this person, otherwise the last other person. */
export function nextSpeaker(rows: TableRow[]): Speaker {
  const last = rows.at(-1);
  if (!last) return { name: "Leif", avatar: "leif" };
  for (let i = rows.length - 2; i >= 0; i--)
    if (
      identity(rows[i].persona) === identity(last.persona) &&
      identity(rows[i + 1].persona) !== identity(last.persona)
    )
      return { name: rows[i + 1].persona, avatar: rows[i + 1].avatar };
  const other = rows
    .slice(0, -1)
    .reverse()
    .find((row) => identity(row.persona) !== identity(last.persona));
  return other
    ? { name: other.persona, avatar: other.avatar }
    : identity(last.persona) === "leif"
      ? { name: "Natasha", avatar: "natasha" }
      : { name: "Leif", avatar: "leif" };
}
export function speakerSide(rows: TableRow[], row: TableRow) {
  return conversationSpeakers(rows).findIndex(
    (p) => identity(p.name) === identity(row.persona),
  ) % 2
    ? "right"
    : "left";
}
export function splitSentences(text: string): string[] {
  // Chinese terminators, newlines, and English/Jyutping sentence punctuation.
  // Decimals, common abbreviations and initials are kept intact.
  const result: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let end = i + 1;
    if (c === "\n") {
    } else if (/[。！？!?]/.test(c)) {
      while (/[。！？!?]/.test(text[end] || " ")) end++;
    } else if (c === "." && (!text[i + 1] || /\s/.test(text[i + 1]))) {
      const prefix = text.slice(start, i + 1);
      if (
        /\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e)\.$/i.test(prefix) ||
        /\b[A-Z]\.$/.test(prefix)
      )
        continue;
      while (text[end] === ".") end++;
    } else continue;
    while (/[”’」』"']/u.test(text[end] || " ")) end++;
    const sentence = text.slice(start, end).trim();
    if (sentence) result.push(sentence);
    start = end;
    i = end - 1;
  }
  const tail = text.slice(start).trim();
  if (tail) result.push(tail);
  return result;
}
export function sentenceCount(value: { chinese: string; definition: string }) {
  return Math.max(
    splitSentences(value.chinese).length,
    splitSentences(value.definition).length,
  );
}
function parts<T extends Card | TableRow>(source: T): T[] {
  const chinese = splitSentences(source.chinese),
    english = splitSentences(source.definition),
    readings = splitSentences(source.jyutping);
  const count = Math.max(chinese.length, english.length);
  if (count < 2) return [source];
  // Do not guess which half of an untranslated source corresponds to a sentence.
  if (chinese.length !== count)
    throw Error(
      "Add sentence punctuation to the Cantonese first so each translation can be kept with its sentence.",
    );
  return chinese.map((text, i) => {
    const analysis = analyzeLocal(text);
    const aligned = english.length === count;
    return {
      ...source,
      id: i === 0 ? source.id : crypto.randomUUID(),
      chinese: text,
      jyutping: readings.length === count ? readings[i] : analysis.jyutping,
      definition: aligned ? english[i] : analysis.definition,
      words: analysis.words.map(
        (word) => source.words.find((w) => w.chinese === word.chinese) || word,
      ),
      translation: aligned ? source.translation : analysis.translation,
      note: i === 0 ? source.note : "",
      receipt: "",
      audio: i === 0 ? source.audio : undefined,
      audioName:
        i === 0 && source.audio ? "Full original recording" : undefined,
      splitSource:
        i === 0
          ? source.splitSource || {
              chinese: source.chinese,
              jyutping: source.jyutping,
              definition: source.definition,
            }
          : undefined,
    };
  });
}
/** One transaction keeps splitting atomic for synchronization and Undo. */
export function splitConversationTurn(doc: Y.Doc, card: Card, row: TableRow) {
  const turns = parts(row);
  if (turns.length < 2) return [];
  if (card.rows.length + turns.length - 1 > 500)
    throw Error("This conversation is full. Start another conversation first.");
  replaceTableRow(
    doc,
    card.id,
    row.id,
    turns.map((turn) => createTableRow(turn)),
  );
  return turns;
}
export function splitPhraseCard(
  doc: Y.Doc,
  card: Card,
  cards: Card[],
  bounds: (card: Card) => Box = estimatedBox,
) {
  const pieces = parts(card);
  if (pieces.length < 2) return [];
  const occupied = cards.filter((c) => c.id !== card.id).map(bounds);
  let x = card.x,
    y = card.y;
  const arranged = pieces.map((piece, i) => {
    const next = createCard({ ...piece, width: 0, height: 0, x, y });
    const box = estimatedBox(next);
    // Keep enough room for either participant's reading and wrapped meaning.
    box.height = Math.max(
      box.height,
      56 +
        Math.ceil(piece.jyutping.length / 32) * 25 +
        (piece.mode === "full"
          ? Math.ceil(piece.definition.length / 36) * 20
          : 0),
    );
    // Leave existing manual placements alone. Stack in reading order, then wrap.
    let attempts = 0;
    while (true) {
      if (y + box.height > 3500 || y > 3300) {
        x += box.width + 32;
        y = 40;
      }
      if (x + box.width > 5500 || x > 5300 || ++attempts > 1000)
        throw Error(
          "There is not enough space here. Move the card to a clearer area before splitting.",
        );
      const obstacle = occupied.find((other) =>
        intersects(
          { x, y, width: box.width + 16, height: box.height + 16 },
          other,
        ),
      );
      if (i === 0 || !obstacle) break;
      y = obstacle.y + obstacle.height + 24;
    }
    next.x = x;
    next.y = y;
    occupied.push({ ...box, x, y });
    y += box.height + 24;
    return next;
  });
  doc.transact(() =>
    arranged.forEach((piece, i) =>
      i === 0 ? patchCard(doc, card.id, piece) : addCard(doc, piece),
    ),
  );
  return arranged;
}
