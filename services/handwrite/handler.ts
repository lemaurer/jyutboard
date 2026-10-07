import type { IncomingMessage, ServerResponse } from "node:http";
import {
  recognizeHandwriting,
  RecognitionError,
} from "../../server/handwriting-recognition";
export const config = { maxDuration: 60 };
export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Use POST." }));
    return;
  }
  try {
    if (Number(req.headers["content-length"]) > 1_510_000)
      throw new RecognitionError(413, "Write a shorter phrase.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new RecognitionError(400, "Invalid recognition request.");
    const result = await recognizeHandwriting(body, req.headers.authorization);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(error instanceof RecognitionError ? error.status : 502, {
      "Content-Type": "application/json",
    });
    res.end(
      JSON.stringify({
        error:
          error instanceof RecognitionError
            ? error.message
            : "Recognition unavailable. Retry or edit the text.",
      }),
    );
  }
}
