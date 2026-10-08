import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Presence, Stroke } from "./model";
import { inkOutline } from "./ink";
export type LiveInkHandle = { paint: (stroke: Stroke | null) => void };
/** Pointer samples are local to this layer, not state on the whole canvas. */
export const LiveInk = forwardRef<LiveInkHandle>(function LiveInk(_, ref) {
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const latest = useRef<Stroke | null>(null),
    frame = useRef(0);
  useImperativeHandle(
    ref,
    () => ({
      paint(value) {
        latest.current = value;
        if (!value) {
          cancelAnimationFrame(frame.current);
          frame.current = 0;
          setStroke(null);
          return;
        }
        if (!frame.current)
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            const value = latest.current;
            setStroke(
              value
                ? {
                    ...value,
                    points: [...value.points],
                    pressures: value.pressures
                      ? [...value.pressures]
                      : undefined,
                  }
                : null,
            );
          });
      },
    }),
    [],
  );
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <svg className="remote-ink-layer" width={5600} height={3600}>
      {stroke &&
        (stroke.arrow ? (
          <polyline
            points={stroke.points.map((point) => point.join(",")).join(" ")}
            stroke={stroke.color}
            strokeWidth={stroke.width ?? 3}
            markerEnd="url(#arrowhead)"
            fill="none"
          />
        ) : (
          <path
            data-testid="pending-ink"
            d={inkOutline(stroke)}
            fill={stroke.color}
            opacity={stroke.opacity ?? 1}
          />
        ))}
    </svg>
  );
});
export function RemoteInk({
  committed,
  sessionId,
}: {
  committed: Stroke[];
  sessionId: string;
}) {
  const [values, setValues] = useState<Record<string, Presence>>({});
  useEffect(() => {
    const latest = new Map<string, Presence>();
    let frame = 0;
    const receive = (event: Event) => {
      const peer = (event as CustomEvent<Presence>).detail;
      latest.set(peer.id, peer);
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          setValues(Object.fromEntries(latest));
        });
    };
    const leave = (event: Event) => {
      latest.delete((event as CustomEvent<string>).detail);
      setValues(Object.fromEntries(latest));
    };
    window.addEventListener("jyutboard:motion", receive);
    window.addEventListener("jyutboard:motion-leave", leave);
    const timer = setInterval(() => {
      for (const [id, peer] of latest)
        if (Date.now() - peer.at > 6000) latest.delete(id);
      setValues(Object.fromEntries(latest));
    }, 2000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener("jyutboard:motion", receive);
      window.removeEventListener("jyutboard:motion-leave", leave);
    };
  }, [sessionId]);
  const ids = new Set(committed.map((stroke) => stroke.id));
  return (
    <svg className="remote-ink-layer" width={5600} height={3600}>
      {Object.values(values).flatMap((peer) =>
        peer.ink &&
        Date.now() - peer.ink.at < 6000 &&
        !ids.has(peer.ink.stroke.id)
          ? [
              <path
                key={peer.id}
                data-testid="live-ink"
                d={inkOutline(peer.ink.stroke)}
                fill={peer.ink.stroke.color}
                opacity={peer.ink.stroke.opacity ?? 1}
              />,
            ]
          : [],
      )}
    </svg>
  );
}
