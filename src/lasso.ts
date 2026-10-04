import type { Box } from "./canvasGeometry";
type Point = [number, number];
export function insideLasso(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function crossing(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    abC * abD <= 0 &&
    cdA * cdB <= 0 &&
    Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) &&
    Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) &&
    Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) &&
    Math.max(c[1], d[1]) >= Math.min(a[1], b[1])
  );
}
export function lassoHitsStroke(polygon: Point[], points: Point[]) {
  if (polygon.length < 3) return false;
  if (points.some((p) => insideLasso(p, polygon))) return true;
  return points.some(
    (p, i) =>
      i > 0 &&
      polygon.some((a, j) =>
        crossing(points[i - 1], p, a, polygon[(j + 1) % polygon.length]),
      ),
  );
}
export function lassoHitsBox(polygon: Point[], box: Box) {
  const corners: Point[] = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ];
  return (
    polygon.some(
      ([x, y]) =>
        x >= box.x &&
        x <= box.x + box.width &&
        y >= box.y &&
        y <= box.y + box.height,
    ) || lassoHitsStroke(polygon, [...corners, corners[0]])
  );
}
