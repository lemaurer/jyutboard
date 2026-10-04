import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TabletGestures,
  type View,
  type GestureClock,
} from "../src/TabletGestures";
function fixture() {
  let time = 0,
    next = 0,
    view: View = { x: 1200, y: 900, zoom: 1 };
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
  const viewport = {
    scrollWidth: 5600,
    scrollHeight: 3600,
    clientWidth: 1024,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {},
  } as unknown as HTMLElement;
  const gestures = new TabletGestures(
    viewport,
    () => view,
    (value) => {
      view = value;
    },
    () => "draw",
    () => false,
    clock,
  );
  const event = (type: string, x: number, y = 200, pointerId = 1) =>
    ({
      type,
      pointerType: "touch",
      pointerId,
      clientX: x,
      clientY: y,
      target: { closest: () => null },
    }) as unknown as PointerEvent;
  function advance(ms: number) {
    time += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  }
  function fling() {
    gestures.down(event("pointerdown", 400));
    advance(16);
    gestures.move(event("pointermove", 380));
    advance(16);
    gestures.move(event("pointermove", 350));
    gestures.up(event("pointerup", 350));
  }
  return { gestures, event, advance, fling, view: () => view, frames };
}
test("finger panning coasts with decaying velocity and a fresh touch stops it immediately", () => {
  const f = fixture();
  f.fling();
  const released = f.view().x;
  f.advance(16);
  const first = f.view().x - released;
  f.advance(16);
  const second = f.view().x - released - first;
  assert.ok(first > 0 && second > 0 && second < first);
  f.gestures.down(f.event("pointerdown", 350));
  const stopped = f.view();
  f.advance(100);
  assert.deepEqual(f.view(), stopped);
  f.gestures.dispose();
  assert.equal(f.frames.size, 0);
});
test("momentum covers the same distance at 60 and 120 Hz and stays inside the canvas", () => {
  const a = fixture(),
    b = fixture();
  a.fling();
  b.fling();
  for (let i = 0; i < 60; i++) a.advance(1000 / 60);
  for (let i = 0; i < 120; i++) b.advance(1000 / 120);
  assert.ok(Math.abs(a.view().x - b.view().x) < 0.001);
  for (let i = 0; i < 200; i++) a.advance(16);
  assert.equal(a.frames.size, 0);
  assert.ok(a.view().x > 1250 && a.view().x <= 4576);
});
test("holding before release, cancelled touches and pinch zoom do not fling", () => {
  for (const cancel of [false, true]) {
    const f = fixture();
    f.gestures.down(f.event("pointerdown", 400));
    f.advance(16);
    f.gestures.move(f.event("pointermove", 350));
    if (!cancel) f.advance(100);
    f.gestures.up(f.event(cancel ? "pointercancel" : "pointerup", 350));
    assert.equal(f.frames.size, 0);
  }
  const f = fixture();
  f.gestures.down(f.event("pointerdown", 400));
  f.gestures.down(f.event("pointerdown", 500, 200, 2));
  f.advance(16);
  f.gestures.move(f.event("pointermove", 540, 200, 2));
  assert.ok(f.view().zoom > 1);
  f.gestures.up(f.event("pointerup", 540, 200, 2));
  f.gestures.up(f.event("pointerup", 400));
  assert.equal(f.frames.size, 0);
});
