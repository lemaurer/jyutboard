export type View = { x: number; y: number; zoom: number };
type Contact = { x: number; y: number };
export type GestureClock = {
  now: () => number;
  frame: (callback: (time: number) => void) => number;
  cancel: (id: number) => void;
};
const browserClock: GestureClock = {
  now: () => performance.now(),
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};
/** Finger navigation is independent of Pencil ink and never edits the shared document. */
export class TabletGestures {
  private contacts = new Map<number, Contact>();
  private previous?: { x: number; y: number; distance: number };
  private pen = false;
  private navigating = false;
  private velocity = { x: 0, y: 0 };
  private sampleTime = 0;
  private motionTime = 0;
  private coastFrame = 0;
  private zooming = false;
  constructor(
    private viewport: HTMLElement,
    private read: () => View,
    private write: (view: View) => void,
    private tool: () => string,
    private manipulate: (event: PointerEvent) => boolean = () => false,
    private clock: GestureClock = browserClock,
  ) {}
  get multipleContacts() {
    return this.contacts.size > 1;
  }
  get navigationActive() {
    return this.navigating && !this.pen;
  }
  stop() {
    this.clock.cancel(this.coastFrame);
    this.coastFrame = 0;
    this.velocity = { x: 0, y: 0 };
  }
  dispose() {
    this.stop();
    this.contacts.clear();
  }
  down(event: PointerEvent): boolean {
    this.stop();
    this.sampleTime = this.clock.now();
    this.motionTime = 0;
    this.zooming = false;
    if (event.pointerType === "pen") {
      this.contacts.clear();
      this.navigating = false;
      this.previous = undefined;
      this.pen = true;
      return false;
    }
    if (event.pointerType !== "touch") return false;
    if (this.pen) {
      return true;
    }
    if (
      (event.target as Element).closest("button,select,summary") &&
      !this.contacts.size
    )
      return false;
    this.contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.navigating ||=
      this.contacts.size > 1 ||
      (!this.manipulate(event) &&
        ["draw", "highlight", "arrow", "pan"].includes(this.tool()));
    this.previous = this.center();
    if (this.navigating) this.viewport.setPointerCapture(event.pointerId);
    return this.navigating;
  }
  move(event: PointerEvent): boolean {
    if (event.pointerType === "touch" && this.pen) return true;
    if (!this.contacts.has(event.pointerId)) return false;
    if (!this.navigating) {
      this.contacts.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      this.previous = this.center();
      return false;
    }
    this.contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = this.center(),
      previous = this.previous;
    this.previous = next;
    const time = this.clock.now();
    const elapsed = Math.max(1, time - this.sampleTime);
    this.sampleTime = time;
    if (previous) {
      const dx = previous.x - next.x,
        dy = previous.y - next.y;
      const weight = 1 - Math.exp(-elapsed / 35);
      this.velocity.x +=
        (Math.max(-3, Math.min(3, dx / elapsed)) - this.velocity.x) * weight;
      this.velocity.y +=
        (Math.max(-3, Math.min(3, dy / elapsed)) - this.velocity.y) * weight;
      if (Math.hypot(dx, dy) > 0.5) this.motionTime = time;
      this.zooming ||=
        previous.distance > 0 &&
        Math.abs(next.distance - previous.distance) > 1;
      const view = this.read(),
        rect = this.viewport.getBoundingClientRect();
      const zoom = Math.max(
        0.35,
        Math.min(
          2.5,
          view.zoom *
            (previous.distance > 0 && next.distance > 0
              ? next.distance / previous.distance
              : 1),
        ),
      );
      const worldX = (view.x + previous.x - rect.left) / view.zoom,
        worldY = (view.y + previous.y - rect.top) / view.zoom;
      this.write({
        zoom,
        x: worldX * zoom - (next.x - rect.left),
        y: worldY * zoom - (next.y - rect.top),
      });
    }
    return true;
  }
  up(event: PointerEvent): boolean {
    if (event.pointerType === "pen") {
      this.pen = false;
      return false;
    }
    if (this.pen && event.pointerType === "touch") return true;
    const handled = this.navigating && this.contacts.has(event.pointerId);
    this.contacts.delete(event.pointerId);
    this.previous = this.contacts.size ? this.center() : undefined;
    if (!this.contacts.size) {
      this.navigating = false;
      if (
        handled &&
        event.type !== "pointercancel" &&
        !this.zooming &&
        this.clock.now() - this.motionTime < 80
      )
        this.coast();
      else this.stop();
    } else {
      // A pinch lifting one finger must not become a fling or jump.
      this.velocity = { x: 0, y: 0 };
      this.sampleTime = this.clock.now();
      this.motionTime = 0;
    }
    return handled;
  }
  releasePen(event: PointerEvent) {
    if (event.pointerType === "pen") this.pen = false;
  }
  private coast() {
    let previous = this.clock.now();
    const tick = (time: number) => {
      const elapsed = Math.min(64, time - previous);
      previous = time;
      const decay = Math.exp(-elapsed / 325);
      // Integrate the same decay at 60/120 Hz, rather than slowing per frame.
      const travel = 325 * (1 - decay);
      const view = this.read();
      const x = Math.max(
        0,
        Math.min(
          this.viewport.scrollWidth - this.viewport.clientWidth,
          view.x + this.velocity.x * travel,
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          this.viewport.scrollHeight - this.viewport.clientHeight,
          view.y + this.velocity.y * travel,
        ),
      );
      this.velocity.x = x === view.x ? 0 : this.velocity.x * decay;
      this.velocity.y = y === view.y ? 0 : this.velocity.y * decay;
      this.write({ ...view, x, y });
      if (Math.hypot(this.velocity.x, this.velocity.y) > 0.035)
        this.coastFrame = this.clock.frame(tick);
      else this.stop();
    };
    if (Math.hypot(this.velocity.x, this.velocity.y) > 0.035)
      this.coastFrame = this.clock.frame(tick);
  }
  private center() {
    const values = [...this.contacts.values()];
    const a = values[0],
      b = values[1];
    return b
      ? {
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          distance: Math.hypot(a.x - b.x, a.y - b.y),
        }
      : { ...a, distance: 0 };
  }
}
