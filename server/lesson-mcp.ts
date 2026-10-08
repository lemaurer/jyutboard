import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import { lessonSchema, validateLesson } from "../src/lessonTools";
import { publishLesson } from "./lesson-publish";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AVATARS, PERSONAS } from "../src/PersonAvatar";
import { STICKERS } from "../src/Stickers";

const server = new McpServer({ name: "jyutboard-lessons", version: "1.0.0" });
const schema = zodToJsonSchema(lessonSchema, { name: "JyutBoardLesson" });
const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
server.registerResource(
  "lesson-guide",
  "jyutboard://lesson/guide",
  {
    mimeType: "text/markdown",
    description:
      "Complete authoring guide, privacy behavior, examples and live publication setup.",
  },
  async () => ({
    contents: [
      {
        uri: "jyutboard://lesson/guide",
        mimeType: "text/markdown",
        text: await readFile(
          resolve(__dirname, "../docs/lesson-api.md"),
          "utf8",
        ),
      },
    ],
  }),
);
server.registerTool(
  "lesson_assets",
  {
    description:
      "List valid illustrated sticker IDs, avatar IDs and default personas for lesson authoring.",
    inputSchema: {},
  },
  async () =>
    text({
      stickers: STICKERS.map((sticker) => ({
        id: sticker.id,
        label: sticker.name,
      })),
      avatars: AVATARS.map((avatar) => ({
        id: avatar.id,
        label: avatar.label,
      })),
      personas: PERSONAS,
    }),
);
server.registerResource(
  "lesson-schema",
  "jyutboard://lesson/schema",
  {
    mimeType: "application/json",
    description:
      "Complete versioned schema for all canvas objects, layouts, vocabulary states and reveal controls.",
  },
  async () => ({
    contents: [
      {
        uri: "jyutboard://lesson/schema",
        mimeType: "application/json",
        text: JSON.stringify(schema, null, 2),
      },
    ],
  }),
);
server.registerTool(
  "lesson_schema",
  {
    description: "Get the full lesson JSON schema and privacy rules.",
    inputSchema: {},
  },
  async () =>
    text({
      schema,
      rules: [
        "Use traditional colloquial Cantonese; Leif sees Jyutping, Natasha Chinese.",
        "Supply correct English meanings; omitted Jyutping is derived locally.",
        "Use concealed:true on objects or rows for one-by-one reveals.",
        "teacherNotes remain local to Natasha when JSON is imported; never shared.",
        "Vocabulary states are hints; connected JyutDeck vocabulary is authoritative.",
        "Manual layout preserves coordinates; spacing locally separates overlaps; grid/column layout runs once for new structures.",
        "Import appends new IDs and preserves existing lessons and undo.",
      ],
    }),
);
server.registerTool(
  "create_lesson",
  {
    description:
      "Validate and arrange a complete lesson. Returns JSON for Natasha to import via Lesson tools > Import AI lesson. No network writes.",
    inputSchema: { lesson: lessonSchema },
  },
  async ({ lesson }) => {
    try {
      return text(validateLesson(lesson));
    } catch (error) {
      return {
        ...text({
          error: error instanceof Error ? error.message : "Invalid lesson",
        }),
        isError: true,
      };
    }
  },
);
if (process.env.JYUTBOARD_ROOM && process.env.JYUTBOARD_RELAY)
  server.registerTool(
    "publish_lesson",
    {
      description:
        "Append a lesson to the configured live session. Requires user-authorized teaching room. Lessons with private notes must instead use JSON import.",
      inputSchema: { lesson: lessonSchema },
    },
    async ({ lesson }) => {
      try {
        return text(
          await publishLesson(
            lesson,
            process.env.JYUTBOARD_ROOM!,
            process.env.JYUTBOARD_RELAY!,
          ),
        );
      } catch (error) {
        return {
          ...text({
            error:
              error instanceof Error
                ? error.message
                : "Could not publish lesson",
          }),
          isError: true,
        };
      }
    },
  );
void server.connect(new StdioServerTransport()).catch(() => {
  process.stderr.write("Could not start lesson MCP server.\n");
  process.exitCode = 1;
});
