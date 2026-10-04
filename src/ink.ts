import { getStroke } from "perfect-freehand";
import type { Stroke } from "./model";
export function inkOutline(stroke: Stroke): string {
  const outline = getStroke(
    stroke.points.map(([x, y], index) => [
      x,
      y,
      stroke.pressures?.[index] ?? 0.5,
    ]),
    {
      size: stroke.width ?? 3,
      thinning: stroke.pressures?.length ? 0.5 : 0,
      smoothing: 0.65,
      streamline: 0.2,
      simulatePressure: false,
      last: true,
    },
  );
  if (!outline.length) return "";
  return `M${outline.map((p) => p.join(",")).join(" L")} Z`;
}
