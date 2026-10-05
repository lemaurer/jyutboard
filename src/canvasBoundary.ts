export type Boundary = {
  minX: number;
  minY: number;
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
  desktop = false,
): Boundary {
  const margin = (size: number) =>
    Math.ceil(
      Math.min(size * 0.3, Math.max(size * 0.12, 180 * Math.sqrt(zoom))) *
        (desktop ? 0.55 : 1),
    );
  const inset = 40;
  const x = width * zoom - viewportWidth,
    y = height * zoom - viewportHeight;
  return {
    minX: x < 0 ? x / 2 : -inset,
    minY: y < 0 ? y / 2 : -inset,
    maxX: x < 0 ? x / 2 : x + inset,
    maxY: y < 0 ? y / 2 : y + inset,
    limitX: margin(viewportWidth),
    limitY: margin(viewportHeight),
  };
}
/** Continuous at the edge; progressively less travel for the same finger movement. */
export function rubberAxis(
  value: number,
  maximum: number,
  limit: number,
  minimum = 0,
) {
  const anchor = Math.max(minimum, Math.min(maximum, value));
  const distance = value - anchor;
  return (
    anchor +
    Math.sign(distance) * limit * (1 - Math.exp(-Math.abs(distance) / limit))
  );
}
export function unRubberAxis(
  value: number,
  maximum: number,
  limit: number,
  minimum = 0,
) {
  const anchor = Math.max(minimum, Math.min(maximum, value));
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
  minimum = 0,
  omega = 0.014,
) {
  const target = Math.max(minimum, Math.min(maximum, value)),
    displacement = value - target;
  const c = velocity + omega * displacement,
    decay = Math.exp(-omega * elapsed);
  const next = (displacement + c * elapsed) * decay;
  const speed = (velocity - omega * c * elapsed) * decay;
  return Math.abs(next) < 0.2 && Math.abs(speed) < 0.015
    ? { value: target, velocity: 0 }
    : { value: target + next, velocity: speed };
}

/** Reverse input moves the visible camera immediately, without paying back hidden overscroll. */
export function advanceAxis(
  value: number,
  delta: number,
  maximum: number,
  limit: number,
  minimum = 0,
) {
  const next = value + delta;
  if ((value < minimum && delta > 0) || (value > maximum && delta < 0)) {
    if ((next < minimum && delta > 0) || (next > maximum && delta < 0))
      return next;
    return rubberAxis(next, maximum, limit, minimum);
  }
  return rubberAxis(
    unRubberAxis(value, maximum, limit, minimum) + delta,
    maximum,
    limit,
    minimum,
  );
}
