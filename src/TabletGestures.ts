import {
  canvasBoundary,
  rubberAxis,
  advanceAxis,
  springAxis,
  type Boundary,
} from "./canvasBoundary";
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
  private springRate = 0.014;
  private dragView?: View;
  private wheelTimer?: ReturnType<typeof setTimeout>;
  constructor(
    private viewport: HTMLElement,
    private read: () => View,
    private write: (view: View, inFrame?: boolean) => void,
    private tool: () => string,
    private manipulate: (event: PointerEvent) => boolean = () => false,
    private clock: GestureClock = browserClock,
    private boundary?: (zoom: number) => Boundary,
  ) {}
  get multipleContacts() {
    return this.contacts.size > 1;
  }
  get navigationActive() {
    return this.navigating && !this.pen;
  }
  stop() {
    clearTimeout(this.wheelTimer);
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
    this.springRate = 0.014;
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
    this.dragView = this.read();
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
      const view = this.dragView || this.read(),
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
      const desired = {
        zoom,
        x: worldX * zoom - (next.x - rect.left),
        y: worldY * zoom - (next.y - rect.top),
      };
      const b = this.bounds(zoom);
      this.dragView =
        Math.abs(zoom - view.zoom) > 0.000001
          ? this.resist(desired)
          : {
              ...desired,
              x: advanceAxis(view.x, dx, b.maxX, b.limitX, b.minX),
              y: advanceAxis(view.y, dy, b.maxY, b.limitY, b.minY),
            };
      this.write(this.dragView);
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
      if (handled && this.outside(this.read())) {
        if (event.type === "pointercancel" || this.zooming)
          this.velocity = { x: 0, y: 0 };
        this.coast();
      } else if (
        handled &&
        event.type !== "pointercancel" &&
        !this.zooming &&
        this.clock.now() - this.motionTime < 80
      )
        this.coast();
      else this.stop();
      this.dragView = undefined;
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
  private bounds(zoom: number) {
    return (
      this.boundary?.(zoom) ??
      canvasBoundary(
        this.viewport.scrollWidth / zoom,
        this.viewport.scrollHeight / zoom,
        this.viewport.clientWidth,
        this.viewport.clientHeight,
        zoom,
      )
    );
  }
  private resist(view: View) {
    const b = this.bounds(view.zoom);
    return {
      ...view,
      x: rubberAxis(view.x, b.maxX, b.limitX, b.minX),
      y: rubberAxis(view.y, b.maxY, b.limitY, b.minY),
    };
  }
  private outside(view: View) {
    const b = this.bounds(view.zoom);
    return (
      view.x < b.minX - 0.1 ||
      view.x > b.maxX + 0.1 ||
      view.y < b.minY - 0.1 ||
      view.y > b.maxY + 0.1
    );
  }
  settle() {
    this.stop();
    if (this.outside(this.read())) this.coast();
  }
  panWheel(dx: number, dy: number) {
    this.stop();
    const view = this.read(),
      b = this.bounds(view.zoom);
    this.write({
      ...view,
      x: advanceAxis(view.x, dx, b.maxX, b.limitX, b.minX),
      y: advanceAxis(view.y, dy, b.maxY, b.limitY, b.minY),
    });
    this.deferSettle();
  }
  deferSettle() {
    clearTimeout(this.wheelTimer);
    this.springRate = 0.024;
    this.wheelTimer = setTimeout(() => this.settle(), 75);
  }
  private coast() {
    let previous = this.clock.now();
    const tick = (time: number) => {
      const elapsed = Math.max(0, Math.min(64, time - previous));
      previous = time;
      const decay = Math.exp(-elapsed / 325),
        travel = 325 * (1 - decay);
      const view = this.read(),
        b = this.bounds(view.zoom);
      const step = (
        position: number,
        velocity: number,
        maximum: number,
        limit: number,
        minimum: number,
      ) => {
        if (position < minimum || position > maximum) {
          const spring = springAxis(
            position,
            velocity,
            maximum,
            elapsed,
            minimum,
            this.springRate,
          );
          return {
            value: Math.max(
              minimum - limit,
              Math.min(maximum + limit, spring.value),
            ),
            velocity: spring.velocity,
          };
        }
        const value = position + velocity * travel;
        return {
          value: rubberAxis(value, maximum, limit, minimum),
          velocity:
            velocity * decay * (value < minimum || value > maximum ? 0.45 : 1),
        };
      };
      const x = step(view.x, this.velocity.x, b.maxX, b.limitX, b.minX),
        y = step(view.y, this.velocity.y, b.maxY, b.limitY, b.minY);
      this.velocity = { x: x.velocity, y: y.velocity };
      const next = { ...view, x: x.value, y: y.value };
      this.write(next, true);
      if (
        this.outside(next) ||
        Math.hypot(this.velocity.x, this.velocity.y) > 0.035
      )
        this.coastFrame = this.clock.frame(tick);
      else {
        this.write(
          {
            ...next,
            x: Math.max(b.minX, Math.min(b.maxX, next.x)),
            y: Math.max(b.minY, Math.min(b.maxY, next.y)),
          },
          true,
        );
        this.stop();
      }
    };
    if (
      this.outside(this.read()) ||
      Math.hypot(this.velocity.x, this.velocity.y) > 0.035
    )
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
