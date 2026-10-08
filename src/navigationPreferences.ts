export function navigationSpeed(value: unknown, fallback = 1) {
  const speed = Number(value);
  return Number.isFinite(speed) && speed >= 0.5 && speed <= 3
    ? speed
    : fallback;
}
