import * as Y from "yjs";
import { z } from "zod";
import {
  addCard,
  cardSchema,
  tableRowSchema,
  connectorSchema,
  createCard,
  createTableRow,
  patchCard,
  patchTableRow,
  readCards,
  strokeSchema,
  type Card,
  type Stroke,
  type Connector,
} from "./model";
import { analyzeLocal } from "./language";
import type { Box } from "./canvasGeometry";

export const layoutSchema = z
  .object({
    mode: z.enum(["manual", "grid", "column"]).default("manual"),
    gap: z.number().min(16).max(160).default(40),
    columns: z.number().int().min(1).max(8).default(3),
    x: z.number().min(0).max(5300).default(120),
    y: z.number().min(0).max(3300).default(120),
  })
  .strict();
const objectSchema = cardSchema
  .partial()
  .extend({
    id: z.string().min(1).max(100),
    kind: cardSchema.shape.kind,
    rows: z
      .array(
        tableRowSchema
          .partial()
          .extend({ id: z.string().min(1).max(100) })
          .strict(),
      )
      .max(500)
      .optional(),
  })
  .strict();
export const lessonSchema = z
  .object({
    version: z.literal(1),
    title: z.string().min(1).max(200),
    scenario: z.string().max(4000).default(""),
    objectives: z.array(z.string().max(500)).max(30).default([]),
    layout: layoutSchema.default({}),
    objects: z.array(objectSchema).max(500),
    strokes: z.array(strokeSchema).max(1000).default([]),
    connectors: z.array(connectorSchema).max(1000).default([]),
    teacherNotes: z
      .array(
        z
          .object({
            objectId: z.string().max(100).optional(),
            text: z.string().max(8000),
          })
          .strict(),
      )
      .max(500)
      .default([]),
  })
  .strict();
export type LessonInput = z.input<typeof lessonSchema>;
export type TeacherNote = { objectId?: string; text: string };

/** Stable reading order; layout is an explicit undoable action, never reactive. */
export function readingOrder<T extends { x: number; y: number; id: string }>(
  items: T[],
) {
  return [...items].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id),
  );
}
export function arrangeBoxes(
  items: (Box & { id: string })[],
  options: z.input<typeof layoutSchema>,
) {
  const settings = layoutSchema.parse(options);
  const result = new Map<string, { x: number; y: number }>();
  if (settings.mode === "manual") return result;
  const columns = settings.mode === "column" ? 1 : settings.columns;
  const widths = Array.from({ length: columns }, (_, col) =>
    Math.max(
      0,
      ...items.filter((_, i) => i % columns === col).map((item) => item.width),
    ),
  );
  let y = settings.y;
  for (let start = 0; start < items.length; start += columns) {
    const row = items.slice(start, start + columns);
    let x = settings.x;
    for (const [col, item] of row.entries()) {
      if (
        x + item.width > 5600 ||
        y + item.height > 3600 ||
        x > 5300 ||
        y > 3300
      )
        throw Error(
          "These elements need more space. Try fewer columns or arrange a smaller selection.",
        );
      result.set(item.id, { x, y });
      x += widths[col] + settings.gap;
    }
    y += Math.max(...row.map((item) => item.height)) + settings.gap;
  }
  return result;
}
export function estimatedBox(card: Card): Box & { id: string } {
  return {
    id: card.id,
    x: card.x,
    y: card.y,
    width:
      card.width ||
      (card.kind === "table" ? 650 : card.kind === "conversation" ? 500 : 300),
    height:
      card.height ||
      (card.rows.length
        ? 80 + card.rows.length * (card.kind === "conversation" ? 160 : 48)
        : 140),
  };
}
export function validateLesson(value: unknown) {
  const lesson = lessonSchema.parse(value);
  const ids = new Set<string>();
  const objects = lesson.objects.map((object) => {
    if (ids.has(object.id)) throw Error(`Duplicate object id: ${object.id}`);
    ids.add(object.id);
    const local =
      object.chinese && object.kind === "phrase"
        ? analyzeLocal(object.chinese)
        : {};
    const rows = object.rows?.map((row) =>
      createTableRow({
        ...(row.chinese ? analyzeLocal(row.chinese) : {}),
        ...row,
      }),
    );
    const card = cardSchema.parse(
      createCard({ ...local, ...object, rows: rows || [] }),
    );
    const rowIds = new Set<string>();
    for (const row of card.rows) {
      if (rowIds.has(row.id)) throw Error(`Duplicate row id: ${row.id}`);
      rowIds.add(row.id);
    }
    return card;
  });
  for (const item of [...lesson.strokes, ...lesson.connectors]) {
    if (ids.has(item.id)) throw Error(`Duplicate element id: ${item.id}`);
    ids.add(item.id);
  }
  for (const edge of lesson.connectors)
    if (
      !objects.some((o) => o.id === edge.from) ||
      !objects.some((o) => o.id === edge.to)
    )
      throw Error("Connector endpoints must reference lesson objects.");
  for (const note of lesson.teacherNotes)
    if (note.objectId && !objects.some((o) => o.id === note.objectId))
      throw Error("Teacher note refers to an unknown object.");
  const positions = arrangeBoxes(objects.map(estimatedBox), lesson.layout);
  return {
    ...lesson,
    objects: objects.map((object) => ({
      ...object,
      ...positions.get(object.id),
    })),
  };
}
/** All validation happens before the transaction; imports append and never overwrite. */
export function importLesson(doc: Y.Doc, input: unknown) {
  const lesson = validateLesson(input);
  const remap = new Map(
    lesson.objects.map((object) => [object.id, crypto.randomUUID()]),
  );
  doc.transact(() => {
    for (const object of lesson.objects)
      addCard(doc, {
        ...object,
        id: remap.get(object.id)!,
        rows: object.rows.map((row) => ({ ...row, id: crypto.randomUUID() })),
      });
    for (const stroke of lesson.strokes) {
      const id = crypto.randomUUID();
      doc.getMap<Stroke>("strokes").set(id, { ...stroke, id });
    }
    for (const edge of lesson.connectors) {
      const id = crypto.randomUUID();
      doc
        .getMap<Connector>("connectors")
        .set(id, {
          ...edge,
          id,
          from: remap.get(edge.from)!,
          to: remap.get(edge.to)!,
        });
    }
    doc.getMap("lessonInfo").set("scenario", lesson.scenario);
    doc.getMap("lessonInfo").set("objectives", lesson.objectives);
  });
  return {
    ids: [...remap.values()],
    title: lesson.title,
    teacherNotes: lesson.teacherNotes.map((note) => ({
      ...note,
      objectId: note.objectId ? remap.get(note.objectId) : undefined,
    })),
  };
}
export function exportLesson(
  doc: Y.Doc,
  title: string,
  teacherNotes: TeacherNote[] = [],
) {
  return {
    version: 1 as const,
    title,
    scenario: doc.getMap("lessonInfo").get("scenario") || "",
    objectives: doc.getMap("lessonInfo").get("objectives") || [],
    layout: { mode: "manual" as const },
    objects: readCards(doc),
    strokes: [...doc.getMap<Stroke>("strokes").values()],
    connectors: [...doc.getMap<Connector>("connectors").values()],
    teacherNotes,
  };
}
export function revealNext(doc: Y.Doc, cards: Card[]) {
  for (const card of readingOrder(cards)) {
    if (card.concealed) {
      patchCard(doc, card.id, { concealed: false });
      return card.id;
    }
    const row = card.rows.find((row) => row.concealed);
    if (row) {
      patchTableRow(doc, card.id, row.id, { concealed: false });
      return row.id;
    }
  }
  return null;
}
export function convertSelection(
  doc: Y.Doc,
  cards: Card[],
  kind: "table" | "conversation",
) {
  const ordered = readingOrder(cards.filter((card) => card.kind === "phrase"));
  if (ordered.length < 2) throw Error("Select at least two phrase cards.");
  const target = createCard({
    kind,
    chinese: kind === "table" ? "Phrase list" : "Conversation",
    x: ordered[0].x,
    y: ordered[0].y,
    mode: ordered[0].mode,
    rows: ordered.map((card, i) =>
      tableRowSchema.parse({
        ...card,
        id: card.id,
        mode: card.mode,
        persona: i % 2 ? "Natasha" : "Leif",
        avatar: i % 2 ? "natasha" : "leif",
      }),
    ),
  });
  const ids = new Set(ordered.map((card) => card.id));
  doc.transact(() => {
    addCard(doc, target);
    ordered.forEach((card) => doc.getMap("cards").delete(card.id));
    for (const [id, edge] of doc.getMap<Connector>("connectors")) {
      const from = ids.has(edge.from) ? target.id : edge.from;
      const to = ids.has(edge.to) ? target.id : edge.to;
      if (from === to) doc.getMap("connectors").delete(id);
      else if (from !== edge.from || to !== edge.to)
        doc.getMap<Connector>("connectors").set(id, { ...edge, from, to });
    }
  });
  return target;
}
/** Explicit slot substitutions keep the rest of the phrase byte-for-byte. */
export function sentenceVariants(
  card: Card,
  slot: string,
  replacements: string[],
) {
  if (!slot.trim() || !card.chinese.includes(slot))
    throw Error("Choose a word or phrase from the original Chinese sentence.");
  const unique = [
    ...new Set(replacements.map((text) => text.trim()).filter(Boolean)),
  ];
  if (!unique.length || unique.length > 12)
    throw Error("Add between one and twelve substitutions.");
  return unique.map((replacement, i) => {
    const chinese = card.chinese.replace(slot, replacement);
    if (chinese.length > 2000) throw Error("A variation is too long.");
    return createCard({
      ...card,
      ...analyzeLocal(chinese),
      chinese,
      id: crypto.randomUUID(),
      starred: false,
      audio: undefined,
      audioName: undefined,
      receipt: undefined,
      created: Date.now() + i,
      width: 0,
      height: 0,
    });
  });
}
