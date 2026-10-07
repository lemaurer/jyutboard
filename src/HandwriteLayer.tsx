import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Check, Pencil, RotateCcw, X, LoaderCircle } from "lucide-react";
import type { Stroke } from "./model";
import { inkOutline } from "./ink";
import {
  HANDWRITE_IDLE_MS,
  handwritingBox,
  handwritingImage,
  nearbyHandwriting,
} from "./handwriting";
type Phase =
  "writing" | "waiting" | "recognizing" | "preview" | "error" | "confirming";
type Draft = {
  id: string;
  strokes: Stroke[];
  revision: number;
  phase: Phase;
  text: string;
  error: string;
  editing: boolean;
};
export type HandwriteHandle = {
  active: () => boolean;
  begin: (point: [number, number], pointer: number, pressure?: number) => void;
  move: (point: [number, number], pointer: number, pressure?: number) => void;
  end: (pointer?: number, cancelled?: boolean) => void;
};
export const HandwriteLayer = forwardRef<
  HandwriteHandle,
  {
    enabled: boolean;
    zoom: () => number;
    onConfirm: (text: string, position: [number, number]) => Promise<boolean>;
  }
>(({ enabled, zoom, onConfirm }, handle) => {
  const data = useRef<Draft[]>([]),
    active = useRef<{ draft: string; stroke: Stroke; pointer: number } | null>(
      null,
    ),
    alive = useRef(true),
    frame = useRef(0),
    timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  function paint() {
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (alive.current) setDrafts([...data.current]);
      });
  }
  function remove(id: string) {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    data.current = data.current.filter((d) => d.id !== id);
    paint();
  }
  async function recognize(id: string) {
    const d = data.current.find((d) => d.id === id);
    if (!d || active.current?.draft === id) return;
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const revision = ++d.revision;
    d.phase = "recognizing";
    d.error = "";
    paint();
    try {
      if (!window.desktop?.recognize)
        throw Error(
          "Update JyutBoard or join an Internet lesson for recognition. You can still edit the text.",
        );
      const result = await window.desktop.recognize(
        handwritingImage(d.strokes),
      );
      if (
        !alive.current ||
        !data.current.includes(d) ||
        d.revision !== revision
      )
        return;
      d.text = result.chinese.trim();
      if (!d.text)
        throw Error("Could not read this phrase. Edit the text or try again.");
      d.phase = "preview";
    } catch (e) {
      if (
        !alive.current ||
        !data.current.includes(d) ||
        d.revision !== revision
      )
        return;
      d.phase = "error";
      d.error =
        e instanceof Error
          ? e.message
          : "Recognition unavailable. Try again or edit.";
    }
    paint();
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      for (const timer of timers.current.values()) clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!enabled) {
      active.current = null;
      for (const timer of timers.current.values()) clearTimeout(timer);
      for (const d of data.current)
        if (d.phase === "writing" || d.phase === "waiting") {
          d.phase = "preview";
          d.editing = false;
        }
      paint();
    }
  }, [enabled]);
  useImperativeHandle(handle, () => ({
    active: () => !!active.current,
    begin(point, pointer, pressure = 0.5) {
      if (!enabled || active.current) return;
      let d = data.current
        .slice()
        .reverse()
        .find(
          (d) =>
            d.phase !== "confirming" &&
            nearbyHandwriting(d.strokes, point, zoom()),
        );
      if (!d) {
        if (data.current.length >= 8) return;
        d = {
          id: crypto.randomUUID(),
          strokes: [],
          revision: 0,
          phase: "writing",
          text: "",
          error: "",
          editing: false,
        };
        data.current.push(d);
      }
      if (
        d.strokes.length >= 128 ||
        d.strokes.reduce((n, stroke) => n + stroke.points.length, 0) >= 24000
      ) {
        d.error =
          "This phrase is full. Confirm it, or start another phrase nearby.";
        d.phase = "error";
        paint();
        return;
      }
      clearTimeout(timers.current.get(d.id));
      d.revision++;
      d.text = "";
      d.phase = "writing";
      d.error = "";
      d.editing = false;
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        points: [point],
        pressures: [pressure || 0.5],
        color: "#455c84",
        width: 3.5,
        arrow: false,
      };
      d.strokes.push(stroke);
      active.current = { draft: d.id, stroke, pointer };
      paint();
    },
    move(point, pointer, pressure = 0.5) {
      const a = active.current;
      if (!a || a.pointer !== pointer) return;
      const previous = a.stroke.points.at(-1)!;
      if (
        a.stroke.points.length < 2000 &&
        Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 0.5
      ) {
        a.stroke.points.push(point);
        a.stroke.pressures!.push(pressure || 0.5);
        paint();
      }
    },
    end(pointer, cancelled = false) {
      const a = active.current;
      if (!a || (pointer !== undefined && pointer !== a.pointer)) return;
      active.current = null;
      const d = data.current.find((d) => d.id === a.draft);
      if (!d) return;
      if (cancelled) {
        d.strokes = d.strokes.filter((s) => s !== a.stroke);
        if (!d.strokes.length) {
          remove(d.id);
          return;
        }
      }
      d.phase = "waiting";
      clearTimeout(timers.current.get(d.id));
      timers.current.set(
        d.id,
        setTimeout(() => void recognize(d.id), HANDWRITE_IDLE_MS),
      );
      paint();
    },
  }));
  return (
    <div className="handwrite-layer" data-testid="handwrite-layer">
      <svg
        className="handwrite-ink"
        width="5600"
        height="3600"
        aria-hidden="true"
      >
        {drafts.flatMap((d) =>
          d.strokes.map((s) => (
            <path
              key={s.id}
              data-testid="handwrite-stroke"
              d={inkOutline(s)}
              fill={s.color}
            />
          )),
        )}
      </svg>
      {drafts
        .filter((d) => d.phase !== "writing")
        .map((d) => {
          const b = handwritingBox(d.strokes);
          return (
            <div
              key={d.id}
              className="handwrite-preview"
              data-testid="handwrite-preview"
              style={{
                left: Math.max(0, Math.min(5300, b.x)),
                top: Math.min(3450, b.y + b.height + 16),
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="handwrite-result">
                {d.phase === "waiting" || d.phase === "recognizing" ? (
                  <>
                    <LoaderCircle size={14} className="spin" />
                    <span>
                      {d.phase === "waiting"
                        ? "Finishing…"
                        : "Reading handwriting…"}
                    </span>
                  </>
                ) : d.editing ? (
                  <input
                    ref={(node) => node?.focus({ preventScroll: true })}
                    aria-label="Edit recognized Chinese"
                    placeholder="寫句中文…"
                    value={d.text}
                    maxLength={2000}
                    onChange={(e) => {
                      d.text = e.target.value;
                      paint();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        d.editing = false;
                        paint();
                      }
                    }}
                  />
                ) : (
                  <span>{d.text || "Handwrite → Card"}</span>
                )}
              </div>
              {d.error && (
                <p className="handwrite-error" role="status">
                  {d.error}
                </p>
              )}
              <div className="handwrite-actions">
                <button
                  aria-label="Confirm handwriting card"
                  disabled={
                    !d.text.trim() ||
                    d.phase === "confirming" ||
                    d.phase === "recognizing" ||
                    d.phase === "waiting"
                  }
                  onClick={async () => {
                    d.phase = "confirming";
                    paint();
                    try {
                      if (await onConfirm(d.text, [b.x, b.y])) remove(d.id);
                      else {
                        d.phase = "preview";
                        d.error =
                          "Could not create the card. Your writing is kept.";
                        paint();
                      }
                    } catch {
                      d.phase = "preview";
                      d.error = "Could not create the card. Try again.";
                      paint();
                    }
                  }}
                >
                  <Check size={14} />
                  {d.phase === "confirming" ? "Saving…" : "Confirm"}
                </button>
                <button
                  aria-label="Edit handwriting result"
                  disabled={d.phase === "confirming"}
                  onClick={() => {
                    d.revision++;
                    clearTimeout(timers.current.get(d.id));
                    d.phase = "preview";
                    d.editing = true;
                    d.error = "";
                    paint();
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label="Retry handwriting recognition"
                  disabled={d.phase === "confirming"}
                  onClick={() => void recognize(d.id)}
                >
                  <RotateCcw size={14} />
                </button>
                <button
                  aria-label="Cancel handwriting"
                  disabled={d.phase === "confirming"}
                  onClick={() => remove(d.id)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
});
