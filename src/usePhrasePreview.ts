import { useEffect, useRef, useState } from "react";
import { phraseInput, inputLanguage } from "./phraseInput";
import { analyzeInputLocal, analyzeLocal } from "./language";
import type { SourceLanguage } from "./model";
type Analysis = Awaited<ReturnType<typeof phraseInput>>;
export function usePhrasePreview(
  text: string,
  language: SourceLanguage,
  enabled = true,
): { text: string; analysis?: Analysis; error?: string; pending?: boolean } {
  const [value, setValue] = useState<{
    text: string;
    language?: SourceLanguage;
    analysis?: Analysis;
    error?: string;
    pending?: boolean;
  }>({ text: "" });
  const cache = useRef(new Map<string, Analysis>());
  useEffect(() => {
    let current = true;
    const content = text.trim(),
      source = inputLanguage(content, language),
      key = `${source}:${content}`;
    if (!content || !enabled) {
      setValue({ text: "" });
      return;
    }
    const local =
      source === "chinese"
        ? { chinese: content, ...analyzeLocal(content) }
        : analyzeInputLocal(content, source);
    if (local || cache.current.has(key)) {
      setValue({ text, language, analysis: local || cache.current.get(key) });
      return;
    }
    setValue({ text, language, pending: true });
    const timer = setTimeout(async () => {
      if (source === "jyutping" && !/[1-6][\s,.!?。！？]*$/.test(content)) {
        if (current)
          setValue({
            text,
            language,
            error: "Finish each Jyutping syllable with its tone number (1–6).",
          });
        return;
      }
      try {
        const analysis = await phraseInput(content, source);
        if (cache.current.size >= 40)
          cache.current.delete(cache.current.keys().next().value!);
        cache.current.set(key, analysis);
        if (current) setValue({ text, language, analysis });
      } catch (error) {
        if (current)
          setValue({
            text,
            language,
            error: error instanceof Error ? error.message : String(error),
          });
      }
    }, 750);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text, language, enabled]);
  return value.text === text && value.language === language
    ? value
    : { text, pending: Boolean(text) };
}
