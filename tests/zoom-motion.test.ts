import { test } from "node:test";
import assert from "node:assert/strict";
import { ZoomMotion } from "../src/ZoomMotion";
import { inputLanguage, phraseInput } from "../src/phraseInput";
import type { GestureClock, View } from "../src/TabletGestures";
function fixture() {
  let time = 100,
    next = 0,
    settled = 0,
    view: View = { x: 1200, y: 800, zoom: 1 };
  const frames = new Map<number, (time: number) => void>();
  const clock: GestureClock = {
    now: () => time,
    frame: (callback) => {
      frames.set(++next, callback);
      return next;
    },
    cancel: (id) => {
      frames.delete(id);
    },
  };
  const motion = new ZoomMotion(
    () => view,
    (value) => {
      view = value;
    },
    () => settled++,
    clock,
  );
  return {
    motion,
    read: () => view,
    settled: () => settled,
    advance(ms: number, hz = 60) {
      for (let elapsed = 0; elapsed < ms; elapsed += 1000 / hz) {
        time += 1000 / hz;
        const pending = [...frames.values()];
        frames.clear();
        pending.forEach((callback) => callback(time));
      }
    },
  };
}
test("trackpad zoom gently coasts around the same anchor and new input stops it", () => {
  const value = fixture();
  value.motion.wheel(-6, 400, 300);
  const released = value.read().zoom;
  value.advance(80);
  assert.ok(value.read().zoom > released);
  assert.ok(Math.abs((value.read().x + 400) / value.read().zoom - 1600) < 1e-8);
  value.advance(700);
  assert.equal(value.settled(), 1);
  value.motion.wheel(-6, 400, 300);
  value.motion.stop();
  const stopped = value.read();
  value.advance(500);
  assert.deepEqual(value.read(), stopped);
});
test("zoom momentum agrees at 60 and 120Hz and stops at the zoom limit", () => {
  const a = fixture(),
    b = fixture();
  a.motion.wheel(-6, 400, 300);
  b.motion.wheel(-6, 400, 300);
  a.advance(700, 60);
  b.advance(700, 120);
  assert.ok(Math.abs(a.read().zoom - b.read().zoom) < 0.003);
  a.motion.wheel(-10000, 400, 300);
  a.advance(700);
  assert.equal(a.read().zoom, 2.5);
});
test("English and Jyutping are inferred in either participant's default input mode", async () => {
  assert.equal(inputLanguage("drink water", "chinese"), "english");
  assert.equal(inputLanguage("drink water", "jyutping"), "english");
  assert.equal(inputLanguage("jam2 seoi2", "chinese"), "jyutping");
  for (const language of ["chinese", "jyutping"] as const) {
    const result = await phraseInput("drink water", language);
    assert.equal(result.chinese, "飲水");
    assert.equal(result.jyutping, "jam2 seoi2");
    assert.ok(result.definition);
  }
});
