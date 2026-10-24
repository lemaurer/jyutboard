export function lessonServiceError(error: unknown, status?: number) {
  const message =
    error instanceof Error
      ? error.message
      : String(error || "Lesson service unavailable.");
  if (
    status === 401 ||
    status === 403 ||
    /missing bearer|invalid.*token|unauthori[sz]ed|request token|authentication required/i.test(
      message,
    )
  )
    return "Lesson services are not authorized. On the host desktop, save the JyutDeck external request token in Settings, then start or refresh the Internet lesson. Guests should rejoin that lesson. Your text and recording are kept.";
  if (
    /has not opened|registered lesson|could not verify this lesson/i.test(
      message,
    )
  )
    return "This lesson is not registered or its connection has expired. Ask the host to open Share / Sync and refresh the Internet lesson, then rejoin. Your work is kept.";
  return message;
}
export function pairedServiceBody(body: unknown, room?: string) {
  const value = body as Record<string, unknown>;
  return room &&
    ["vocabulary", "transcribe", "analyze", "recognize"].includes(
      String(value.action),
    )
    ? { room, ...value }
    : value;
}
