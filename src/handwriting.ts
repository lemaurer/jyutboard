import type { Stroke } from "./model";
import { pointsBox, type Box } from "./canvasGeometry";
import { inkOutline } from "./ink";
export const HANDWRITE_IDLE_MS = 1200;
export function handwritingBox(strokes: Stroke[]): Box {
  return pointsBox(strokes.flatMap((stroke) => stroke.points));
}
export function nearbyHandwriting(
  strokes: Stroke[],
  point: [number, number],
  zoom = 1,
) {
  if (!strokes.length) return false;
  const b = handwritingBox(strokes);
  const horizontal = Math.max(70, Math.min(220, 130 / zoom));
  const vertical = Math.max(35, Math.min(100, 65 / zoom));
  return (
    point[0] >= b.x - horizontal &&
    point[0] <= b.x + b.width + horizontal &&
    point[1] >= b.y - vertical &&
    point[1] <= b.y + b.height + vertical
  );
}
export function handwritingImage(strokes: Stroke[]) {
  const b = handwritingBox(strokes),
    pad = 24;
  const scale = Math.min(
    3,
    1600 / Math.max(b.width + pad * 2, b.height + pad * 2, 1),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(64, Math.ceil((b.width + pad * 2) * scale));
  canvas.height = Math.max(64, Math.ceil((b.height + pad * 2) * scale));
  const context = canvas.getContext("2d");
  if (!context)
    throw Error("Could not prepare handwriting. Edit the text instead.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.translate(pad - b.x, pad - b.y);
  context.fillStyle = "#111";
  for (const stroke of strokes) context.fill(new Path2D(inkOutline(stroke)));
  return canvas.toDataURL("image/png");
}
