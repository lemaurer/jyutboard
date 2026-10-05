import type { GestureClock, View } from "./TabletGestures";
const browserClock: GestureClock = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};
/** Short exponential tail for trackpad pinch. Never changes document coordinates. */
export class ZoomMotion {
  private frame = 0;
  private last = 0;
  private previous = 0;
  private velocity = 0;
  private anchor = { x: 0, y: 0 };
  constructor(
    private read: () => View,
    private write: (view: View, inFrame?: boolean) => void,
    private settled: () => void,
    private clock: GestureClock = browserClock,
  ) {}
  stop() {
    this.clock.cancel(this.frame);
    this.frame = 0;
    this.last = 0;
    this.velocity = 0;
  }
  wheel(delta: number, x: number, y: number) {
    const now = this.clock.now(),
      elapsed = this.last ? now - this.last : 16;
    this.clock.cancel(this.frame);
    if (elapsed > 100) this.velocity = 0;
    // Native momentum events already taper, so the additional tail also tapers.
    this.velocity = Math.max(
      -0.0009,
      Math.min(0.0009, (-delta * 0.008) / Math.max(8, elapsed)),
    );
    this.last = now;
    this.previous = now + 40;
    this.anchor = { x, y };
    this.apply(-delta * 0.008, false);
    this.frame = this.clock.frame(this.tick);
  }
  private apply(logDelta: number, inFrame: boolean) {
    const view = this.read(),
      zoom = Math.max(0.35, Math.min(2.5, view.zoom * Math.exp(logDelta))),
      { x, y } = this.anchor;
    this.write(
      {
        zoom,
        x: ((view.x + x) / view.zoom) * zoom - x,
        y: ((view.y + y) / view.zoom) * zoom - y,
      },
      inFrame,
    );
    if (zoom === 0.35 || zoom === 2.5) this.velocity = 0;
  }
  private tick = (now: number) => {
    if (now - this.last < 40) {
      this.frame = this.clock.frame(this.tick);
      return;
    }
    const dt = Math.max(0, Math.min(32, now - this.previous));
    this.previous = now;
    const decay = Math.exp(-dt / 85),
      distance = this.velocity * 85 * (1 - decay);
    this.velocity *= decay;
    this.apply(distance, true);
    if (Math.abs(this.velocity) < 0.00002 || now - this.last > 450) {
      this.frame = 0;
      this.last = 0;
      this.settled();
    } else this.frame = this.clock.frame(this.tick);
  };
}
