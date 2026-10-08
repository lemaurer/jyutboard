import { writeFile } from "node:fs/promises";
import { zodToJsonSchema } from "zod-to-json-schema";
import { lessonSchema } from "../src/lessonTools";
void writeFile(
  "docs/lesson.schema.json",
  JSON.stringify(
    zodToJsonSchema(lessonSchema, { name: "JyutBoardLesson" }),
    null,
    2,
  ) + "\n",
);
