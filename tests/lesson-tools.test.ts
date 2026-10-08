import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startRelay } from "../electron/relay-server";
import { LiveSync } from "../src/sync";
import {
  addCard,
  createCard,
  createTableRow,
  newRoom,
  readCards,
  type Presence,
} from "../src/model";
import {
  arrangeBoxes,
  convertSelection,
  exportLesson,
  importLesson,
  revealNext,
  sentenceVariants,
  validateLesson,
} from "../src/lessonTools";
import { publishLesson } from "../server/lesson-publish";
const input = {
  version: 1,
  title: "Cafe",
  layout: { mode: "grid" },
  objects: [
    {
      id: "a",
      kind: "phrase",
      chinese: "我想飲水",
      definition: "I want water",
      concealed: true,
    },
    {
      id: "b",
      kind: "conversation",
      rows: [
        { id: "turn1", chinese: "你好", definition: "Hello", concealed: true },
      ],
    },
  ],
  teacherNotes: [{ objectId: "a", text: "Ask him to substitute milk tea" }],
};
test("lesson schema enriches omitted fields, preserves manual positions and validates references before mutation", () => {
  const lesson = validateLesson(input);
  assert.match(lesson.objects[0].jyutping, /ngo5/);
  assert.match(lesson.objects[1].rows[0].jyutping, /nei5/);
  assert.equal(lesson.objects[0].concealed, true);
  assert.equal(
    validateLesson({
      ...input,
      layout: { mode: "manual" },
      objects: [{ id: "a", kind: "phrase", x: 800, y: 900 }],
    }).objects[0].x,
    800,
  );
  const doc = new Y.Doc();
  addCard(doc, createCard({ id: "old" }));
  assert.throws(() =>
    importLesson(doc, {
      ...input,
      connectors: [
        { id: "bad", from: "missing", to: "a", color: "#3159e8", width: 2 },
      ],
    }),
  );
  assert.equal(readCards(doc).length, 1);
  assert.throws(() =>
    validateLesson({ ...input, objects: [input.objects[0], input.objects[0]] }),
  );
  doc.destroy();
});
test("layout is explicit, non-overlapping and rejects overflow without partially editing", () => {
  const boxes = [
    { id: "a", x: 700, y: 50, width: 300, height: 160 },
    { id: "b", x: 900, y: 60, width: 440, height: 280 },
    { id: "c", x: 200, y: 700, width: 180, height: 70 },
  ];
  const positions = arrangeBoxes(boxes, {
    mode: "grid",
    columns: 2,
    gap: 40,
    x: 120,
    y: 120,
  });
  assert.deepEqual(positions.get("b"), { x: 460, y: 120 });
  assert.deepEqual(positions.get("c"), { x: 120, y: 440 });
  assert.equal(boxes[0].x, 700);
  assert.equal(arrangeBoxes(boxes, { mode: "manual" }).size, 0);
  assert.throws(() => arrangeBoxes(boxes, { mode: "column", y: 3290 }));
});
test("import appends fresh ids, remaps arrows and returns private notes without ever syncing them", () => {
  const doc = new Y.Doc();
  const result = importLesson(doc, {
    ...input,
    connectors: [
      { id: "edge", from: "a", to: "b", color: "#3159e8", width: 2 },
    ],
  });
  assert.equal(result.teacherNotes[0].objectId, result.ids[0]);
  assert(!JSON.stringify(doc.toJSON()).includes("Ask him"));
  assert(!JSON.stringify(exportLesson(doc, "Cafe")).includes("Ask him"));
  assert.equal(
    (doc.getMap("connectors").toJSON() as any)[
      [...doc.getMap("connectors").keys()][0]
    ].from,
    result.ids[0],
  );
  importLesson(doc, input);
  assert.equal(readCards(doc).length, 4);
  doc.destroy();
});
test("conversion preserves reading order, recordings, stars, modes, division and connector endpoints; undo restores originals", () => {
  const doc = new Y.Doc();
  const a = createCard({
    id: "a",
    chinese: "你好",
    y: 200,
    starred: true,
    audio: "data:audio/webm;base64,YQ==",
    mode: "practice",
    note: "public note",
    concealed: true,
  });
  const b = createCard({ id: "b", chinese: "早晨", y: 100 });
  const outside = createCard({ id: "outside", kind: "note" });
  [a, b, outside].forEach((card) => addCard(doc, card));
  doc.getMap("connectors").set("edge", {
    id: "edge",
    from: "a",
    to: "outside",
    color: "#3159e8",
    width: 2,
  });
  const undo = new Y.UndoManager([
    doc.getMap("cards"),
    doc.getMap("connectors"),
  ]);
  const converted = convertSelection(doc, [a, b], "conversation");
  assert.deepEqual(
    converted.rows.map((row) => row.chinese),
    ["早晨", "你好"],
  );
  assert.equal(converted.rows[1].audio, a.audio);
  assert.equal(converted.rows[1].starred, true);
  assert.equal(converted.rows[1].concealed, true);
  assert.equal(converted.rows[1].note, "public note");
  assert.equal(
    (doc.getMap("connectors").get("edge") as any).from,
    converted.id,
  );
  undo.undo();
  assert.deepEqual(
    readCards(doc)
      .map((card) => card.id)
      .sort(),
    ["a", "b", "outside"],
  );
  undo.destroy();
  doc.destroy();
});
test("reveal walks hidden cards and turns exactly once; older saved lessons default to revealed", () => {
  const doc = new Y.Doc();
  importLesson(doc, input);
  let cards = readCards(doc);
  const cardId = cards[0].id;
  assert.equal(revealNext(doc, cards), cardId);
  cards = readCards(doc);
  assert.equal(cards[0].concealed, false);
  assert.equal(cards[1].rows[0].concealed, true);
  assert.equal(revealNext(doc, cards), cards[1].rows[0].id);
  assert.equal(revealNext(doc, readCards(doc)), null);
  const old = createCard({ id: "legacy" });
  delete old.concealed;
  addCard(doc, old);
  assert.equal(readCards(doc).find((c) => c.id === "legacy")!.concealed, false);
  doc.destroy();
});
test("sentence substitutions preserve surrounding structure and never copy misleading audio or queue receipts", () => {
  const card = createCard({
    chinese: "我想飲水",
    audio: "data:audio/webm;base64,YQ==",
    receipt: "created",
    starred: true,
  });
  const variants = sentenceVariants(card, "水", ["奶茶", "咖啡"]);
  assert.deepEqual(
    variants.map((card) => card.chinese),
    ["我想飲奶茶", "我想飲咖啡"],
  );
  assert.equal(variants[0].audio, undefined);
  assert.equal(variants[0].receipt, undefined);
  assert.equal(variants[0].starred, false);
  assert.throws(() => sentenceVariants(card, "missing", ["水"]));
});
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw Error("Sync timeout");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
test("real relay converges imported lessons, reveal controls and transient drag; private notes never cross clients", async () => {
  const relay = await startRelay(0, "127.0.0.1"),
    room = newRoom(),
    a = new Y.Doc(),
    b = new Y.Doc();
  let as = "",
    bs = "",
    motion: Presence | null = null;
  const url = `ws://127.0.0.1:${relay.port}`;
  const aa = new LiveSync(
      a,
      room,
      url,
      "a",
      (s) => (as = s),
      () => {},
    ),
    bb = new LiveSync(
      b,
      room,
      url,
      "b",
      (s) => (bs = s),
      (p) => (motion = p),
    );
  try {
    await until(() => as === "Live" && bs === "Live");
    importLesson(a, input);
    await until(() => readCards(b).length === 2);
    revealNext(a, readCards(a));
    await until(() => !readCards(b)[0].concealed);
    const card = readCards(a)[0];
    for (let i = 0; i < 100; i++)
      aa.presence({
        id: "a",
        role: "teacher",
        at: Date.now(),
        move: { cards: [{ id: card.id, x: 700 + i, y: 600 }], at: Date.now() },
      });
    await until(() => Boolean(motion?.move));
    assert.equal(motion!.move!.cards[0].x, 799);
    assert.equal(readCards(b)[0].x, card.x);
    assert(!JSON.stringify(b.toJSON()).includes("Ask him"));
    await publishLesson({ ...input, teacherNotes: [] }, room, url);
    await until(() => readCards(b).length === 4);
    await assert.rejects(
      publishLesson(input, room, url),
      /private teacher notes/,
    );
  } finally {
    aa.destroy();
    bb.destroy();
    a.destroy();
    b.destroy();
    await relay.close();
  }
});
test("MCP stdio exposes complete schema and generates a validated lesson through the actual protocol", async () => {
  const relay = await startRelay(0, "127.0.0.1"),
    room = newRoom(),
    doc = new Y.Doc();
  let status = "";
  const observer = new LiveSync(
    doc,
    room,
    `ws://127.0.0.1:${relay.port}`,
    "mcp-test",
    (value) => (status = value),
    () => {},
  );
  const client = new Client({ name: "test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["node_modules/tsx/dist/cli.mjs", "server/lesson-mcp.ts"],
    env: {
      JYUTBOARD_ROOM: room,
      JYUTBOARD_RELAY: `ws://127.0.0.1:${relay.port}`,
    },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert(tools.tools.some((tool) => tool.name === "create_lesson"));
    const resource = await client.readResource({
      uri: "jyutboard://lesson/schema",
    });
    assert.match((resource.contents[0] as any).text, /teacherNotes/);
    const guide = await client.readResource({
      uri: "jyutboard://lesson/guide",
    });
    assert.match((guide.contents[0] as any).text, /Sentence variations/);
    const assets = await client.callTool({
      name: "lesson_assets",
      arguments: {},
    });
    assert.match((assets.content as any)[0].text, /milk-tea/);
    const result = await client.callTool({
      name: "create_lesson",
      arguments: { lesson: input },
    });
    assert(!result.isError);
    const generated = JSON.parse((result.content as any)[0].text);
    assert.equal(generated.objects[0].definition, "I want water");
    assert.match(generated.objects[0].jyutping, /ngo5/);
    await until(() => status === "Live");
    const publication = await client.callTool({
      name: "publish_lesson",
      arguments: { lesson: { ...input, teacherNotes: [] } },
    });
    assert(!publication.isError);
    await until(() => readCards(doc).length === 2);
  } finally {
    await client.close();
    observer.destroy();
    doc.destroy();
    await relay.close();
  }
});
