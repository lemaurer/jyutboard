import { analyzeInputLocal, analyzeLocal } from "./language";
import type { SourceLanguage } from "./model";
/** Both participants create canonical phrases, regardless of their display language. */
export function inputLanguage(
  text: string,
  preferred?: SourceLanguage,
): SourceLanguage {
  if (/\p{Script=Han}/u.test(text)) return "chinese";
  if (preferred === "english") return preferred;
  return /(?:^|\s)[a-z]+[1-6](?:\s|[,.!?]|$)/i.test(text)
    ? "jyutping"
    : "english";
}
export async function phraseInput(text: string, preferred?: SourceLanguage) {
  const content = text.trim(),
    language = inputLanguage(content, preferred);
  if (language === "chinese")
    return { chinese: content, ...analyzeLocal(content) };
  const result =
    analyzeInputLocal(content, language) ??
    (await window.desktop?.analyze?.(content, language));
  if (
    !result?.chinese?.trim() ||
    !result.jyutping?.trim() ||
    !result.definition?.trim()
  )
    throw Error(
      "Join an Internet lesson to translate this phrase. Your text is kept.",
    );
  return {
    ...result,
    definition: language === "english" ? content : result.definition,
    translation: language === "english" ? "edited" : "translated",
  };
}
