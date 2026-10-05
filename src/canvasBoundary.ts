export type Boundary = {
  maxX: number;
  maxY: number;
  limitX: number;
  limitY: number;
};
export function canvasBoundary(
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
): Boundary {
  const margin = (size: number) =>
    Math.ceil(
      Math.min(size * 0.3, Math.max(size * 0.12, 180 * Math.sqrt(zoom))),
    );
  return {
    maxX: Math.max(0, width * zoom - viewportWidth),
    maxY: Math.max(0, height * zoom - viewportHeight),
    limitX: margin(viewportWidth),
    limitY: margin(viewportHeight),
  };
}
/** Continuous at the edge; progressively less travel for the same finger movement. */
export function rubberAxis(value: number, maximum: number, limit: number) {
  const anchor = Math.max(0, Math.min(maximum, value));
  const distance = value - anchor;
  return (
    anchor +
    Math.sign(distance) * limit * (1 - Math.exp(-Math.abs(distance) / limit))
  );
}
export function unRubberAxis(value: number, maximum: number, limit: number) {
  const anchor = Math.max(0, Math.min(maximum, value));
  const distance = value - anchor;
  return (
    anchor -
    Math.sign(distance) *
      limit *
      Math.log(1 - Math.min(0.99999, Math.abs(distance) / limit))
  );
}
/** Analytic critically damped spring: stable at both 60 Hz and 120 Hz. */
export function springAxis(
  value: number,
  velocity: number,
  maximum: number,
  elapsed: number,
) {
  const target = Math.max(0, Math.min(maximum, value)),
    displacement = value - target;
  const omega = 0.014,
    c = velocity + omega * displacement,
    decay = Math.exp(-omega * elapsed);
  const next = (displacement + c * elapsed) * decay;
  const speed = (velocity - omega * c * elapsed) * decay;
  return Math.abs(next) < 0.2 && Math.abs(speed) < 0.015
    ? { value: target, velocity: 0 }
    : { value: target + next, velocity: speed };
}
