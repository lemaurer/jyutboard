import type { Word } from "./model";
export type VocabularySnapshot = {
  known: string[];
  queued: string[];
  at: number;
};
export type HighlightMode = "off" | "always" | "created" | "selected";
export const wordKey = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .toLowerCase();
export function vocabularyState(
  word: Word,
  snapshot?: VocabularySnapshot,
): Word["state"] {
  if (!snapshot) return word.state || "unknown";
  const key = wordKey(word.chinese);
  if (snapshot.known.some((value) => wordKey(value) === key)) return "known";
  if (snapshot.queued.some((value) => wordKey(value) === key)) return "queued";
  return "new";
}
export function VocabularyPhrase({
  text,
  words,
  chinese,
  snapshot,
  mode,
  selected,
  recent,
}: {
  text: string;
  words: Word[];
  chinese: boolean;
  snapshot?: VocabularySnapshot;
  mode: HighlightMode;
  selected: boolean;
  recent: boolean;
}) {
  const active =
    mode === "always" ||
    (mode === "selected" && selected) ||
    (mode === "created" && recent);
  // Only colour exact text ranges. Edited divisions must never rewrite the phrase.
  let cursor = 0;
  const segments: { text: string; word?: Word }[] = [];
  for (const word of words) {
    const token = chinese ? word.chinese : word.jyutping;
    if (!token) continue;
    const index = text.indexOf(token, cursor);
    if (index < 0) continue;
    if (index > cursor) segments.push({ text: text.slice(cursor, index) });
    segments.push({ text: token, word });
    cursor = index + token.length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return (
    <span
      className={`inline-vocabulary ${active ? "highlight-enabled" : ""} highlight-${mode}`}
    >
      {segments.map((part, index) => (
        <span
          key={index}
          className={
            part.word
              ? `vocab-word state-${vocabularyState(part.word, snapshot)}`
              : ""
          }
          title={
            part.word && active
              ? vocabularyState(part.word, snapshot)
              : undefined
          }
        >
          {part.text}
        </span>
      ))}
    </span>
  );
}
