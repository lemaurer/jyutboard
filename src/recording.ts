/** Prefer an audio-only MP4 recording usable by Safari and the transcription service. */
export function recordingMime(supports: (mime: string) => boolean) {
  return [
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
  ].find(supports);
}
export async function settledRecording(chunks: Blob[], mime: string) {
  // Give WebKit's delayed final chunk/container trailer time to arrive after stop.
  await new Promise((resolve) => setTimeout(resolve, 120));
  let blob = new Blob(chunks, {
    type: mime || chunks.find((chunk) => chunk.type)?.type || "audio/mp4",
  });
  if (blob.size < 256) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    blob = new Blob(chunks, {
      type: mime || chunks.find((chunk) => chunk.type)?.type || "audio/mp4",
    });
  }
  if (blob.type.startsWith("video/mp4"))
    blob = blob.slice(0, blob.size, "audio/mp4");
  return blob;
}
