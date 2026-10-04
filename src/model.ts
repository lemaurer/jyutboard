import * as Y from "yjs";
import { z } from "zod";
export type Role = "teacher" | "learner";
export type Word = {
  chinese: string;
  jyutping: string;
  definition: string;
  state?: "new" | "learning" | "known" | "queued" | "unknown";
};
export type TableRow = {
  id: string;
  chinese: string;
  jyutping: string;
  definition: string;
  note: string;
  words: Word[];
  translation: string;
  persona: string;
  avatar: string;
  answerChinese: string;
  answerJyutping: string;
  answerDefinition: string;
};
export type CardMode =
  | "full"
  | "compact"
  | "peek"
  | "characters"
  | "breakdown"
  | "practice"
  | "inline";
export type CardShape = "rounded" | "sheet" | "sticky" | "bubble";
export type SourceLanguage = "chinese" | "jyutping" | "english";
export type Card = {
  id: string;
  kind: "phrase" | "note" | "table" | "sticker" | "conversation";
  chinese: string;
  jyutping: string;
  definition: string;
  words: Word[];
  x: number;
  y: number;
  starred: boolean;
  created: number;
  translation: string;
  mode: CardMode;
  shape: CardShape;
  rows: TableRow[];
  hideEnglishForLearner: boolean;
  sourceLanguage: SourceLanguage;
  note: string;
  sticker: string;
  width: number;
  height: number;
  textScale: number;
  tint: string;
  tableVariant: "phrases" | "vocabulary" | "pattern" | "qa" | "comparison";
  tableStyle: "minimal" | "ruled" | "cards";
  audio?: string;
  audioName?: string;
  receipt?: string;
};
export type Stroke = {
  id: string;
  points: [number, number][];
  color: string;
  arrow: boolean;
  width?: number;
  opacity?: number;
};
export type Connector = {
  id: string;
  from: string;
  to: string;
  color: string;
  width: number;
};
export type Session = {
  id: string;
  title: string;
  created: number;
  relay?: string;
};
export type Presence = {
  id: string;
  role: Role;
  x?: number;
  y?: number;
  draft?: string;
  signal?: string;
  attentionAt?: number;
  presenting?: boolean;
  laser?: { points: [number, number][]; at: number };
  view?: { x: number; y: number; zoom: number };
  at: number;
};
export const ROOM_PATTERN = /^[a-f0-9]{48}$/;
export const MAX_AUDIO = 2_000_000;
export function newRoom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export function createCard(fields: Partial<Card> = {}): Card {
  return {
    id: crypto.randomUUID(),
    kind: "phrase",
    chinese: "",
    jyutping: "",
    definition: "",
    words: [],
    x: 90,
    y: 90,
    starred: false,
    created: Date.now(),
    translation: "local",
    mode: "full",
    shape: "rounded",
    rows: [],
    hideEnglishForLearner: false,
    sourceLanguage: "chinese",
    note: "",
    sticker: "star",
    width: 0,
    height: 0,
    textScale: 1,
    tint: "",
    tableVariant: "phrases",
    tableStyle: "minimal",
    ...fields,
  };
}
export function createTableRow(fields: Partial<TableRow> = {}): TableRow {
  return {
    id: crypto.randomUUID(),
    chinese: "",
    jyutping: "",
    definition: "",
    note: "",
    words: [],
    translation: "local",
    persona: "Natasha",
    avatar: "natasha",
    answerChinese: "",
    answerJyutping: "",
    answerDefinition: "",
    ...fields,
  };
}
export function addCard(doc: Y.Doc, card: Card) {
  const map = new Y.Map();
  doc.transact(() => {
    for (const [key, value] of Object.entries(card)) {
      if (key === "rows") {
        const rows = new Y.Array<Y.Map<unknown>>();
        rows.insert(
          0,
          card.rows.map((row) => {
            const item = new Y.Map<unknown>();
            for (const [field, entry] of Object.entries(row))
              item.set(field, entry);
            return item;
          }),
        );
        map.set(key, rows);
      } else map.set(key, value);
    }
    doc.getMap<Y.Map<unknown>>("cards").set(card.id, map);
  });
}
export function patchCard(doc: Y.Doc, id: string, patch: Partial<Card>) {
  const map = doc.getMap<Y.Map<unknown>>("cards").get(id);
  if (map)
    doc.transact(() => {
      for (const [key, value] of Object.entries(patch))
        if (value !== undefined) map.set(key, value);
    });
}
function tableRows(doc: Y.Doc, cardId: string) {
  const value = doc.getMap<Y.Map<unknown>>("cards").get(cardId)?.get("rows");
  return value instanceof Y.Array ? (value as Y.Array<Y.Map<unknown>>) : null;
}
export function addTableRow(doc: Y.Doc, cardId: string, row: TableRow) {
  const rows = tableRows(doc, cardId);
  if (!rows) return;
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(row)) map.set(key, value);
  rows.push([map]);
}
export function patchTableRow(
  doc: Y.Doc,
  cardId: string,
  rowId: string,
  patch: Partial<TableRow>,
) {
  const row = tableRows(doc, cardId)
    ?.toArray()
    .find((item) => item.get("id") === rowId);
  if (row)
    doc.transact(() => {
      for (const [key, value] of Object.entries(patch))
        if (value !== undefined) row.set(key, value);
    });
}
export function deleteTableRow(doc: Y.Doc, cardId: string, rowId: string) {
  const rows = tableRows(doc, cardId);
  const index =
    rows?.toArray().findIndex((item) => item.get("id") === rowId) ?? -1;
  if (rows && index >= 0) rows.delete(index);
}
export function getTableRow(
  doc: Y.Doc,
  cardId: string,
  rowId: string,
): TableRow | null {
  const row = tableRows(doc, cardId)
    ?.toArray()
    .find((item) => item.get("id") === rowId);
  if (!row) return null;
  const result = tableRowSchema.safeParse(row.toJSON());
  return result.success ? result.data : null;
}
const wordSchema = z.object({
  chinese: z.string().max(2000),
  jyutping: z.string().max(2000),
  definition: z.string().max(4000),
  state: z.enum(["new", "learning", "known", "queued", "unknown"]).optional(),
});
export const tableRowSchema = z.object({
  persona: z.string().max(80).default("Natasha"),
  avatar: z.string().max(40).default("natasha"),
  answerChinese: z.string().max(2000).default(""),
  answerJyutping: z.string().max(4000).default(""),
  answerDefinition: z.string().max(4000).default(""),
  id: z.string().max(100),
  chinese: z.string().max(2000),
  jyutping: z.string().max(4000),
  definition: z.string().max(4000),
  note: z.string().max(4000).default(""),
  words: z.array(wordSchema).max(2000),
  translation: z.string().max(200).default("local"),
});
export const cardSchema = z.object({
  id: z.string().max(100),
  kind: z.enum(["phrase", "note", "table", "sticker", "conversation"]),
  chinese: z.string().max(2000),
  jyutping: z.string().max(4000),
  definition: z.string().max(4000),
  words: z.array(wordSchema).max(2000),
  x: z.number().min(0).max(5300),
  y: z.number().min(0).max(3300),
  starred: z.boolean(),
  created: z.number(),
  translation: z.string().max(200),
  mode: z
    .enum([
      "full",
      "compact",
      "peek",
      "characters",
      "breakdown",
      "practice",
      "inline",
    ])
    .default("full"),
  shape: z.enum(["rounded", "sheet", "sticky", "bubble"]).default("rounded"),
  tableVariant: z
    .enum(["phrases", "vocabulary", "pattern", "qa", "comparison"])
    .default("phrases"),
  tableStyle: z.enum(["minimal", "ruled", "cards"]).default("minimal"),
  rows: z.array(tableRowSchema).max(500).default([]),
  hideEnglishForLearner: z.boolean().default(false),
  sourceLanguage: z.enum(["chinese", "jyutping", "english"]).default("chinese"),
  note: z.string().max(4000).default(""),
  sticker: z.string().max(64).default("star"),
  width: z.number().min(0).max(1400).default(0),
  height: z.number().min(0).max(1400).default(0),
  textScale: z.number().min(0.5).max(3).default(1),
  tint: z
    .string()
    .regex(/^$|^#[0-9a-fA-F]{6}$/)
    .default(""),
  audio: z
    .string()
    .max(2_800_000)
    .regex(/^data:audio\/[\w.+-]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  audioName: z.string().max(200).optional(),
  receipt: z.string().max(500).optional(),
});
export function readCards(doc: Y.Doc): Card[] {
  return [...doc.getMap<Y.Map<unknown>>("cards").values()]
    .flatMap((map) => {
      const result = cardSchema.safeParse(
        map instanceof Y.Map ? map.toJSON() : null,
      );
      return result.success ? [result.data] : [];
    })
    .sort((a, b) => a.created - b.created);
}
export function inviteFor(room: string, relay: string) {
  validateRelay(relay);
  if (!ROOM_PATTERN.test(room)) throw new Error("Invalid room.");
  return `jyutboard://join#${new URLSearchParams({ room, relay })}`;
}
export function parseInvite(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "jyutboard:" || url.hostname !== "join")
    throw new Error("Paste a JyutBoard invitation.");
  const p = new URLSearchParams(url.hash.slice(1));
  const room = p.get("room") ?? "";
  const relay = p.get("relay") ?? "";
  if (!ROOM_PATTERN.test(room)) throw new Error("Invalid room code.");
  validateRelay(relay);
  return { room, relay };
}
export function validateRelay(value: string) {
  const url = new URL(value);
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error(
      "Use a ws:// or wss:// relay address without credentials or query parameters.",
    );
  return value;
}
export function queuePayload(cards: Card[], session: Session) {
  // Let JyutDeck perform its canonical analysis. Its API cannot ingest audio.
  return {
    requests: cards.map((card) => ({
      ...(card.chinese.trim() ? { chinese: card.chinese.trim() } : {}),
      ...(card.sourceLanguage !== "chinese"
        ? {
            requestText:
              card.sourceLanguage === "jyutping"
                ? card.jyutping.trim()
                : card.definition.trim(),
          }
        : {}),
      inputLanguage: card.sourceLanguage,
      note: `From JyutBoard: ${session.title}${card.note ? ` — ${card.note}` : ""}`.slice(
        0,
        4000,
      ),
      metadata: {
        source: "jyutboard",
        sessionId: session.id,
        cardId: card.id,
        hasLessonRecording: Boolean(card.audio),
      },
      idempotencyKey:
        `jyutboard:${session.id}:${card.id}:${card.chinese || card.jyutping || card.definition}`.slice(
          0,
          200,
        ),
    })),
  };
}
export function parseReceipts(payload: unknown, count: number): string[] {
  const data = z
    .object({
      results: z.array(
        z.object({
          index: z.number().int().nonnegative(),
          status: z.enum([
            "created",
            "existing",
            "duplicate",
            "failed",
            "conflict",
          ]),
          message: z.string().optional(),
          id: z.string().optional(),
        }),
      ),
    })
    .parse(payload);
  return Array.from({ length: count }, (_, index) => {
    const entries = data.results.filter((x) => x.index === index);
    if (entries.length !== 1)
      return "failed: Missing or ambiguous queue receipt";
    const r = entries[0];
    return `${r.status}${r.message ? ": " + r.message : ""}`;
  });
}

export const strokeSchema = z.object({
  id: z.string().max(100),
  points: z
    .array(z.tuple([z.number().min(0).max(5600), z.number().min(0).max(3600)]))
    .max(5000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  arrow: z.boolean(),
  width: z.number().min(1).max(60).optional(),
  opacity: z.number().min(0.1).max(1).optional(),
});
export const connectorSchema = z
  .object({
    id: z.string().max(100),
    from: z.string().max(100),
    to: z.string().max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    width: z.number().min(1).max(12),
  })
  .refine((value) => value.from !== value.to);
