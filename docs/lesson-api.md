# AI-generated lessons and compact lesson controls

JyutBoard accepts a versioned JSON lesson using [lesson.schema.json](lesson.schema.json). The same validator is used by the canvas importer and the MCP server. `npm run schema:lesson` regenerates the machine-readable schema from the source. No model key is needed for the MCP server: the connected AI authors the lesson, and JyutBoard validates and lays it out.

## In the app

The **… Lesson tools** menu on the canvas toolbar contains layout, conversion, reveal, private notes, sentence variations, and JSON import/export. It overlays the canvas and does not change viewport geometry. Tools adapt to selection and role.

- **Arrange selected / canvas** lays out cards and drawing strokes with comfortable spacing. It runs once, changes no content, and can be undone. Manual dragging remains unchanged. Connectors follow their endpoints.
- Select phrase cards with desktop Shift-click/marquee or iPad lasso. **Turn into conversation / table** preserves their top-to-bottom, left-to-right order, content, divisions, audio, favorites, notes, modes and reveal flags. The source cards are replaced in one undoable transaction. External arrows attach to the new collection; internal arrows disappear because their endpoints are now rows.
- **Sentence variations** replaces the first occurrence of a selected Chinese word/phrase with up to twelve explicit substitutions. The surrounding sentence stays unchanged. New phrases use normal Jyutping/English enrichment; review their meaning as usual. Recordings and queue receipts are cleared because they belong to the original phrase. This is a controlled teaching pattern tool, not an unreviewed generative paraphraser.
- **Private teaching notes** apply to the selected object, or the whole lesson when nothing is selected. They persist in local storage on Natasha's device, keyed by session. They never enter Yjs, the relay, ordinary backups, shared exports or JyutDeck queue payloads. They are hidden when using Leif's view. They are device-local and should not be used as a cloud notebook.
- **Hide selected / reveal selected** works on a selected object or selected row/turn. **Prepare one-by-one reveal** conceals standalone objects and all collection rows. **Reveal next** follows canvas reading order, then row order. Each row also has its own reveal control. **Reveal everything** restores all shared material. Natasha sees a subdued preview of concealed material; Leif sees no hidden text or recordings, including in the favorites tray and inspector.

Reveal is a teaching presentation control, not confidential storage: material remains in the shared document, and someone with the room capability can inspect it or choose teacher view. Private notes are truly separate local data. Older clients ignore reveal metadata, so both participants should update before using reveals. Older lessons have `concealed: false` by default.

## MCP setup

Install Node 22+, clone the repository and run `npm ci`. Configure any MCP-capable assistant with an absolute checkout path:

```json
{
  "mcpServers": {
    "jyutboard-lessons": {
      "command": "node",
      "args": ["/absolute/path/jyutboard/node_modules/tsx/dist/cli.mjs", "/absolute/path/jyutboard/server/lesson-mcp.ts"]
    }
  }
}
```

The stdio server writes protocol messages to stdout. `npm run mcp:lessons` is also available for local use.

| Capability | Behavior |
| --- | --- |
| Resource `jyutboard://lesson/schema` | Full JSON Schema, including every canvas object and field |
| Resource `jyutboard://lesson/guide` | Full authoring guide, examples and setup |
| Tool `lesson_assets` | Illustrated sticker IDs, avatar IDs and default personas |
| Tool `lesson_schema` | Schema plus authoring, layout, privacy and vocabulary guidance |
| Tool `create_lesson`, `{ "lesson": … }` | Validate, fill omitted local fields, arrange, and return complete lesson JSON; no network writes |
| Tool `publish_lesson`, `{ "lesson": … }` | Available only with an explicitly configured room/relay; append the lesson to that live room and wait for acknowledgement |

The easiest complete flow is: Natasha describes a lesson to an AI → AI calls `create_lesson` → save the result as `.json` → Natasha chooses **Import AI lesson**. Imported private notes are saved only on her device. Existing content is preserved. IDs are remapped, including connectors and private-note anchors, so repeated imports append rather than overwrite. Import and conversion are undoable; private notes are separate from canvas undo.

For direct live publication, add `JYUTBOARD_ROOM` and `JYUTBOARD_RELAY` to the MCP configuration's `env`, taking both from a trusted invitation. Treat the 48-hex room code as a secret capability and grant it only to a trusted assistant. `publish_lesson` validates before connecting, uses the existing relay protocol, merges existing state, publishes once per call and waits for acknowledgement. A connected Mac/Windows/iPad client persists received content. The relay itself has no disk persistence; leave a participant open during publication. Retrying publication after an ambiguous connection error can append another copy, so inspect the canvas first.

Direct publication rejects nonempty `teacherNotes` to ensure private material is never sent to the relay or silently dropped. Use local JSON import for lessons with teacher notes. No public unauthenticated HTTP write endpoint has been added.

## Lesson envelope

| Field | Meaning |
| --- | --- |
| `version` | Required integer `1`; reject unsupported versions |
| `title` | Required nonempty lesson name, at most 200 characters; imports append into the currently open lesson |
| `scenario` | Public teaching context, at most 4,000 characters |
| `objectives` | Up to 30 public goals, 500 characters each |
| `layout` | `{mode: "manual" \| "grid" \| "column", x, y, gap, columns}`. Defaults: manual; origin 120,120; gap 40; columns 3. Grid/column run once, preserving array order. Manual preserves explicit coordinates. Overflow is rejected before mutation. |
| `objects` | Up to 500 cards, notes, tables, conversations or stickers |
| `strokes` | Up to 1,000 permanent pen/highlighter/arrow strokes |
| `connectors` | Up to 1,000 arrows referring to object IDs |
| `teacherNotes` | Up to 500 `{objectId?: string, text: string}` entries. No ID means whole-lesson note. Object IDs must exist. Kept local on import. |

Duplicate element IDs, duplicate row IDs within a collection, dangling arrows, unknown note anchors, invalid audio, oversized values, unexpected fields and out-of-bounds coordinates are rejected. The importer checks a 20 MB file limit. Keep generated lessons small enough for the relay's 20 MB document limit.

## Canvas objects

Every object requires `id` and `kind`; all other object fields have normal app defaults. IDs must be unique. Coordinates use the 5600 × 3600 logical canvas, independent of camera zoom. Top-left `x` ranges 0–5300, `y` 0–3300. `width` and `height` range 0–1400; zero means fit to content. Keep objects within the canvas. Layout estimates natural sizes conservatively; use explicit dimensions for predictable large collections.

| Kind | Content and appearance |
| --- | --- |
| `phrase` | `chinese`, `jyutping`, `definition` (English), `words`, `note`, `audio`, `starred`. Natasha sees Chinese; Leif Jyutping. Use `mode: full` for standard, `peek` for compact hover-meaning, `practice` for language only. `shape: rounded` or `bubble` is recommended. |
| `note` | Plain text in `chinese`, optional `tint`, size and border. Public by default; use `teacherNotes` for private reminders. |
| `table` | Title in `chinese`, `rows`; `tableVariant: phrases \| vocabulary \| pattern \| qa \| comparison`; `tableStyle: minimal \| ruled \| cards`. Shared modes full/peek/practice. |
| `conversation` | Title in `chinese`, ordered `rows`. Each row is a normal favorite/queue-capable phrase with persona/avatar, mode, audio and reveal controls. Speech bubble color follows avatar. |
| `sticker` | `sticker` library ID, position and dimensions. Use built-in IDs (see `src/Stickers.tsx`) or `person-natasha`, `person-leif`, `person-friend`, `person-teacher`, `person-hana`, etc. No remote image URLs. |

Common appearance fields: `tint` is empty (transparent) or a six-digit hex fill, `textScale` 0.5–3, `borderColor` six-digit hex, `borderWidth` 0–6, `borderStyle` solid/dashed/dotted. Speech bubbles have avatar fills by default. `concealed: true` hides an entire object from the learner. `created` controls persisted creation order. Legacy mode/shape values remain accepted for backward compatibility; new authors should use the three modes above.

`words` is an ordered array of `{chinese, jyutping, definition, state?}`. `state` may be new/learning/known/queued/unknown. Supply correct word segmentation when it matters. If omitted for a Chinese phrase, local analysis derives Jyutping and basic meanings. These local meanings can be word-by-word fallbacks; AI authors should always supply accurate idiomatic `definition`. Verified connected JyutDeck vocabulary overrides supplied state hints. Do not pretend guessed states are verified database facts.

### Rows / conversation turns

Each row needs an `id`. Other fields default. `chinese`, `jyutping`, `definition`, `words` and `note` work like phrase content. Omitted Jyutping is derived locally from Chinese. `concealed` affects that row only. `starred`, `audio`, `audioName`, optional `mode`, and `receipt` use normal phrase behavior; new generation should omit queue receipts.

Conversation rows add `persona` (display name) and `avatar` (one of natasha/leif/friend/teacher/hana/leo/amira/noah/mei/sam/jun, etc.; see `src/PersonAvatar.tsx`). Default Natasha/natasha. Alternate turns for a natural dialogue; names are not role permissions. Custom names work with any built-in avatar.

Question/answer and comparison rows add `answerChinese`, `answerJyutping`, `answerDefinition`. Pattern rows use `note` for substitutions. Audio must be an inline `data:audio/<type>;base64,…` URL, within the schema's size limit; never invent recordings.

### Ink and attached arrows

`strokes`: `{id, points: [[x,y],…], color: "#3159e8", arrow: false, width?: 1..60, opacity?: 0.1..1, pressures?: [0..1,…]}`. At most 5,000 points per stroke, within canvas bounds. Pressure entries correspond to points. Use `arrow: true` for an unattached drawn arrow, opacity 0.46 for highlighter. Temporary handwriting and laser trails are live interactions and are not persisted lesson objects.

`connectors`: `{id, from: objectId, to: objectId, color: "#8091b0", width: 2}`. Endpoints must exist and differ. These arrows continuously follow dragging and resizing.

## Example teaching scenario

```json
{
  "version": 1,
  "title": "Ordering a drink",
  "scenario": "Role-play at a Hong Kong cafe",
  "objectives": ["Use 我想飲…", "Ask what someone wants"],
  "layout": {"mode": "grid", "x": 2400, "y": 1400, "columns": 2, "gap": 48},
  "objects": [
    {"id": "pattern", "kind": "phrase", "chinese": "我想飲水", "definition": "I'd like some water.", "mode": "full"},
    {"id": "dialogue", "kind": "conversation", "chinese": "At the cafe", "width": 500, "rows": [
      {"id": "question", "persona": "Natasha", "avatar": "natasha", "chinese": "你想飲咩呀？", "definition": "What would you like to drink?", "concealed": true},
      {"id": "answer", "persona": "Leif", "avatar": "leif", "chinese": "我想飲奶茶。", "definition": "I'd like milk tea.", "concealed": true}
    ]},
    {"id": "drinks", "kind": "table", "tableVariant": "vocabulary", "tableStyle": "ruled", "rows": [
      {"id": "water", "chinese": "水", "definition": "water"},
      {"id": "tea", "chinese": "奶茶", "definition": "milk tea", "concealed": true}
    ]}
  ],
  "connectors": [{"id": "pattern-dialogue", "from": "pattern", "to": "dialogue", "color": "#8091b0", "width": 2}],
  "teacherNotes": [{"objectId": "dialogue", "text": "Reveal one turn at a time; swap water for milk tea after the first attempt."}]
}
```

Ask the AI to build a progression: introduce the pattern → reveal a modeled dialogue → practice substitutions → compare answers. Place objects in array order for predictable auto-layout and reveal sequence. Do not include private teacher guidance in public `scenario`, `note`, row notes or card content.

## Sync and compatibility

Persistent changes still use Yjs and IndexedDB, with the existing room protocol and offline merge. Live ink is sampled for presence, and full-resolution committed ink is synced normally. Drag previews use bounded presence messages and paint directly at animation-frame cadence; final positions are committed once, preserving undo and reducing document churn. Presence is coalesced to the latest sample at roughly 30 Hz, ancillary participant UI updates at roughly 15 Hz, and stale previews expire. Under network backpressure older preview samples are discarded, while document updates retain the usual reliable path. For large group moves the first 24 cards are previewed live; all selected elements commit correctly on release. Drawing strokes themselves use the existing final group-position update.

Existing clients still receive ordinary cards/rows/strokes/connectors and final positions. They ignore new transient motion and reveal fields. Existing handwritten recognition, microphone, queue, pairing, PWA, tablet navigation and auto-update paths stay intact. Physical Apple Pencil and Internet latency should still be tested on the actual devices; automated Safari touch/pen and real local relay tests cannot reproduce every hardware/network condition.
