import { test } from "node:test";
import assert from "node:assert/strict";
import { nearbyHandwriting, handwritingBox } from "../src/handwriting";
import {
  recognizeHandwriting,
  validateHandwritingImage,
  RecognitionError,
} from "../server/handwriting-recognition";
import type { Stroke } from "../src/model";
const strokes: Stroke[] = [
  {
    id: "s",
    points: [
      [100, 200],
      [180, 250],
    ],
    color: "#111",
    arrow: false,
  },
];
function png(width = 100, height = 100) {
  const bytes = Buffer.alloc(33);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return "data:image/png;base64," + bytes.toString("base64");
}
test("handwriting groups neighboring strokes, keeping separate lines/phrases independent", () => {
  assert.deepEqual(handwritingBox(strokes), {
    x: 100,
    y: 200,
    width: 80,
    height: 50,
  });
  assert.equal(nearbyHandwriting(strokes, [210, 220]), true);
  assert.equal(nearbyHandwriting(strokes, [600, 220]), false);
  assert.equal(nearbyHandwriting(strokes, [120, 500]), false);
  assert.equal(nearbyHandwriting(strokes, [300, 220], 2), false);
});
test("recognition rejects URLs, oversized crops and malformed PNG before contacting services", () => {
  for (const image of [
    "https://example.com/a.png",
    png(3000),
    png(0),
    "data:image/png;base64,AAAA",
  ])
    assert.throws(() => validateHandwritingImage(image), RecognitionError);
  assert.equal(validateHandwritingImage(png()), png());
});
test("recognition verifies a registered room before sending bounded ink to the provider", async () => {
  const calls: any[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      url,
      headers: init?.headers,
      body: JSON.parse(String(init?.body)),
    });
    return calls.length === 1
      ? new Response("{}")
      : Response.json({
          choices: [{ message: { content: '{"chinese":"我想飲水"}' } }],
        });
  };
  assert.deepEqual(
    await recognizeHandwriting(
      { room: "a".repeat(48), image: png() },
      undefined,
      fetcher,
      { GROQ_API_KEY: "fixture", HANDWRITE_MODEL: "test-vision" },
    ),
    { chinese: "我想飲水" },
  );
  assert.equal(calls[0].body.action, "resolve");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[1].body.model, "test-vision");
  assert.equal(calls[1].body.messages[1].content[1].image_url.url, png());
});
test("missing/invalid lesson credentials never invoke paid recognition", async () => {
  let count = 0;
  const fetcher: typeof fetch = async () => {
    count++;
    return new Response("{}", { status: 401 });
  };
  await assert.rejects(
    () => recognizeHandwriting({ image: png() }, undefined, fetcher),
    { status: 401 },
  );
  assert.equal(count, 0);
  await assert.rejects(
    () =>
      recognizeHandwriting(
        { image: png() },
        "Bearer " + "x".repeat(24),
        fetcher,
      ),
    { status: 401 },
  );
  assert.equal(count, 1);
});
test("unreadable output and provider failures keep an explicit retry/edit outcome", async () => {
  let count = 0;
  const fetcher: typeof fetch = async () =>
    ++count % 2 === 1
      ? new Response("{}")
      : Response.json({
          choices: [{ message: { content: '{"chinese":"no text"}' } }],
        });
  await assert.rejects(
    () =>
      recognizeHandwriting(
        { image: png(), room: "a".repeat(48) },
        undefined,
        fetcher,
        { GROQ_API_KEY: "fixture" },
      ),
    { status: 422 },
  );
  const failed: typeof fetch = async (url) =>
    String(url).includes("groq")
      ? new Response("{}", { status: 429 })
      : new Response("{}");
  await assert.rejects(
    () =>
      recognizeHandwriting(
        { image: png(), room: "a".repeat(48) },
        undefined,
        failed,
        { GROQ_API_KEY: "fixture" },
      ),
    { status: 429 },
  );
});
