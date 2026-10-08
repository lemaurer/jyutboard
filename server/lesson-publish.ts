import * as Y from "yjs";
import { WebSocket } from "ws";
import { ROOM_PATTERN, validateRelay } from "../src/model";
import { importLesson, validateLesson } from "../src/lessonTools";

/** Uses the existing capability-protected relay, including its durable merge. */
export async function publishLesson(
  input: unknown,
  room: string,
  relay: string,
) {
  const lesson = validateLesson(input);
  if (lesson.teacherNotes.length)
    throw Error(
      "Lessons with private teacher notes must be imported as JSON on Natasha's device. Private notes are never sent through the relay.",
    );
  if (!ROOM_PATTERN.test(room))
    throw Error("Invalid configured room capability.");
  validateRelay(relay);
  const doc = new Y.Doc();
  const socket = new WebSocket(relay, { maxPayload: 30 * 1024 * 1024 });
  return await new Promise<{ objects: number; title: string }>(
    (resolve, reject) => {
      let stage = 0;
      let finished = false;
      const timer = setTimeout(
        () =>
          finish(
            Error(
              "Lesson relay did not acknowledge publication. Check the session connection.",
            ),
          ),
        10000,
      );
      function finish(error?: Error) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        socket.close();
        doc.destroy();
        if (error) reject(error);
        else resolve({ objects: lesson.objects.length, title: lesson.title });
      }
      socket.on("open", () =>
        socket.send(
          JSON.stringify({
            type: "join",
            room,
            id: `mcp-${crypto.randomUUID()}`,
          }),
        ),
      );
      socket.on("error", () =>
        finish(Error("Could not connect to the configured lesson relay.")),
      );
      socket.on("close", () => {
        if (stage !== 2)
          finish(
            Error("Lesson relay closed before acknowledging publication."),
          );
      });
      socket.on("message", (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === "sync") {
            Y.applyUpdate(
              doc,
              new Uint8Array(Buffer.from(message.update, "base64")),
            );
            socket.send(
              JSON.stringify({
                type: "sync",
                update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString(
                  "base64",
                ),
              }),
            );
          } else if (message.type === "update")
            Y.applyUpdate(
              doc,
              new Uint8Array(Buffer.from(message.update, "base64")),
            );
          else if (message.type === "ready" && stage === 0) {
            importLesson(doc, lesson);
            stage = 1;
            socket.send(
              JSON.stringify({
                type: "sync",
                update: Buffer.from(Y.encodeStateAsUpdate(doc)).toString(
                  "base64",
                ),
              }),
            );
          } else if (message.type === "ready" && stage === 1) {
            stage = 2;
            finish();
          }
        } catch {
          finish(Error("Invalid lesson relay response."));
        }
      });
    },
  );
}
