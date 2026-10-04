export type View = { x: number; y: number; zoom: number };
type Contact = { x: number; y: number };
/** Finger navigation is independent of Pencil ink and never edits the shared document. */
export class TabletGestures {
  private contacts = new Map<number, Contact>();
  private previous?: { x: number; y: number; distance: number };
  private pen = false;
  private navigating = false;
  constructor(
    private viewport: HTMLElement,
    private read: () => View,
    private write: (view: View) => void,
    private tool: () => string,
    private manipulate: (event: PointerEvent) => boolean = () => false,
  ) {}
  get navigationActive() {
    return this.navigating && !this.pen;
  }
  down(event: PointerEvent): boolean {
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
    if (previous) {
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
    if (!this.contacts.size) this.navigating = false;
    return handled;
  }
  releasePen(event: PointerEvent) {
    if (event.pointerType === "pen") this.pen = false;
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
