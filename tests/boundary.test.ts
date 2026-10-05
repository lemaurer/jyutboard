import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasBoundary,
  rubberAxis,
  unRubberAxis,
  springAxis,
} from "../src/canvasBoundary";
import { recordingMime, settledRecording } from "../src/recording";
import { analyzeInputLocal } from "../src/language";
test("elastic bounds adapt to zoom and viewport without letting the canvas disappear", () => {
  const small = canvasBoundary(5600, 3600, 768, 500, 0.35),
    large = canvasBoundary(5600, 3600, 1024, 768, 2.5);
  assert.ok(small.limitX > 0 && small.limitX <= 768 * 0.3);
  assert.ok(large.limitX > small.limitX && large.limitX <= 1024 * 0.3);
  assert.equal(canvasBoundary(400, 300, 1000, 800, 0.35).maxX, 0);
});
test("resistance is continuous, grows progressively, bounded, and reverses without a jump", () => {
  const limit = 180,
    max = 2000;
  assert.equal(rubberAxis(0, max, limit), 0);
  const a = rubberAxis(-40, max, limit),
    b = rubberAxis(-80, max, limit),
    c = rubberAxis(-120, max, limit);
  assert.ok(Math.abs(c - b) < Math.abs(b - a));
  assert.ok(Math.abs(rubberAxis(-100000, max, limit)) <= limit);
  for (const value of [-120, -20, 0, 2000, 2040])
    assert.ok(
      Math.abs(
        unRubberAxis(rubberAxis(value, max, limit), max, limit) - value,
      ) < 0.0001,
    );
});
test("spring settles gently and agrees at 60 and 120 Hz", () => {
  const simulate = (hz: number) => {
    let value = -120,
      velocity = 0;
    for (let i = 0; i < hz; i++) {
      const next = springAxis(value, velocity, 2000, 1000 / hz);
      assert.ok(next.value >= value && next.value <= 0);
      ({ value, velocity } = next);
    }
    return value;
  };
  assert.equal(simulate(60), 0);
  assert.equal(simulate(120), 0);
});
test("Safari prefers MP4 and receives a delayed final recording chunk intact", async () => {
  assert.equal(
    recordingMime(
      (mime) => mime === "audio/mp4" || mime === "audio/webm;codecs=opus",
    ),
    "audio/mp4",
  );
  const chunks: Blob[] = [];
  setTimeout(
    () => chunks.push(new Blob([new Uint8Array(1024)], { type: "audio/mp4" })),
    40,
  );
  const audio = await settledRecording(chunks, "audio/mp4");
  assert.equal(audio.size, 1024);
  assert.equal(audio.type, "audio/mp4");
});
test("local English and Jyutping conversion always contains the same three language fields", () => {
  for (const [text, language] of [
    ["Hello", "english"],
    ["nei5 hou2", "jyutping"],
  ] as const) {
    const card = analyzeInputLocal(text, language)!;
    assert.equal(card.chinese, "你好");
    assert.equal(card.jyutping, "nei5 hou2");
    assert.ok(card.definition);
  }
  assert.equal(analyzeInputLocal("ambiguous input", "jyutping"), null);
});
