import { useLayoutEffect, useRef, type RefObject } from "react";
import type * as Y from "yjs";
import type { Card, Stroke } from "./model";
import { pointsBox } from "./canvasGeometry";
/** Shared FLIP animation: save final positions once; animate compositor offsets
 * on each participant, including attached arrows. Never animate camera bounds. */
export function useLayoutMotion(
  doc: Y.Doc | null,
  cards: Card[],
  strokes: Stroke[],
  elements: RefObject<Map<string, HTMLElement>>,
  board: RefObject<HTMLDivElement | null>,
  paint: (cards: Card[], dx: number, dy: number) => void,
) {
  const previous = useRef({ doc, cards, strokes });
  const seen = useRef("");
  const frame = useRef(0),
    cleanup = useRef<(() => void) | null>(null);
  const latestPaint = useRef(paint);
  latestPaint.current = paint;
  function cancel() {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    cleanup.current?.();
    cleanup.current = null;
  }
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { doc, cards, strokes };
    const motion = doc?.getMap("lessonInfo").get("layoutMotion") as
      | { id?: string; ids?: unknown[]; at?: number }
      | undefined;
    if (!motion || typeof motion.id !== "string" || seen.current === motion.id)
      return;
    seen.current = motion.id;
    if (
      old.doc !== doc ||
      !Array.isArray(motion.ids) ||
      motion.ids.length > 1500 ||
      typeof motion.at !== "number" ||
      Math.abs(Date.now() - motion.at) > 5000 ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    cancel();
    const ids = new Set(
      motion.ids.filter((id): id is string => typeof id === "string"),
    );
    const moving = cards.flatMap((card) => {
      const before = old.cards.find((item) => item.id === card.id),
        node = elements.current.get(card.id);
      return ids.has(card.id) &&
        before &&
        node &&
        !node.dataset.remoteMoving &&
        (before.x !== card.x || before.y !== card.y)
        ? [{ card, node, dx: before.x - card.x, dy: before.y - card.y }]
        : [];
    });
    const ink = strokes.flatMap((stroke) => {
      const before = old.strokes.find((item) => item.id === stroke.id),
        node = board.current?.querySelector<SVGElement>(
          `[data-stroke-id="${stroke.id}"]`,
        );
      if (!ids.has(stroke.id) || !before || !node || node.dataset.remoteMoving)
        return [];
      const a = pointsBox(before.points),
        b = pointsBox(stroke.points);
      return a.x !== b.x || a.y !== b.y
        ? [{ node, dx: a.x - b.x, dy: a.y - b.y }]
        : [];
    });
    function paintFrame(t: number) {
      const remaining = Math.pow(1 - t, 3);
      for (const item of moving) {
        item.node.dataset.layoutMoving = "true";
        item.node.style.translate = `${item.dx * remaining}px ${item.dy * remaining}px`;
      }
      for (const item of ink) {
        item.node.dataset.layoutMoving = "true";
        item.node.setAttribute(
          "transform",
          `translate(${item.dx * remaining} ${item.dy * remaining})`,
        );
      }
      latestPaint.current(
        moving.map((item) => ({
          ...item.card,
          x: item.card.x + item.dx * remaining,
          y: item.card.y + item.dy * remaining,
        })),
        0,
        0,
      );
    }
    cleanup.current = () => {
      for (const item of moving) {
        item.node.style.translate = "";
        delete item.node.dataset.layoutMoving;
      }
      for (const item of ink) {
        item.node.removeAttribute("transform");
        delete item.node.dataset.layoutMoving;
      }
      latestPaint.current(
        moving.map((item) => item.card),
        0,
        0,
      );
    };
    paintFrame(0);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 360);
      paintFrame(t);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else cancel();
    };
    frame.current = requestAnimationFrame(tick);
  }, [doc, cards, strokes]);
  useLayoutEffect(() => () => cancel(), [doc]);
  return cancel;
}
