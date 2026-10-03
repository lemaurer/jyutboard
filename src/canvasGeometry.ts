export type Box = { x: number; y: number; width: number; height: number };
export function intersects(a: Box, b: Box) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
export function pointsBox(points: [number, number][]): Box {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
function edge(box: Box, toward: [number, number]): [number, number] {
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2,
    dx = toward[0] - x,
    dy = toward[1] - y;
  if (dx === 0 && dy === 0) return [x, y];
  const factor = Math.min(
    Math.abs(box.width / 2 / dx),
    Math.abs(box.height / 2 / dy),
  );
  return [x + dx * factor, y + dy * factor];
}
export function connectorPoints(a: Box, b: Box): [number, number][] {
  return [
    edge(a, [b.x + b.width / 2, b.y + b.height / 2]),
    edge(b, [a.x + a.width / 2, a.y + a.height / 2]),
  ];
}
export function nearStroke(
  point: [number, number],
  points: [number, number][],
  radius: number,
) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length,
          ),
        )
      : 0;
    if (
      Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy) <= radius
    )
      return true;
  }
  return false;
}
