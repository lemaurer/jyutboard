import ToJyutping from "to-jyutping";
import type { Word } from "./model";
let dictionary: Record<string, string[]> =
  (globalThis as unknown as { JYUTBOARD_DICTIONARY?: Record<string, string[]> })
    .JYUTBOARD_DICTIONARY ?? {};
export function initializeDictionary(value: Record<string, string[]>) {
  dictionary = value;
}
const common: Record<string, [string, string]> = {
  飲水: ["jam2 seoi2", "drink water"],
  埋單: ["maai4 daan1", "ask for / pay the bill"],
  我: ["ngo5", "I; me"],
  你: ["nei5", "you"],
  佢: ["keoi5", "he; she"],
  想: ["soeng2", "want; would like"],
  飲: ["jam2", "drink"],
  食: ["sik6", "eat"],
  水: ["seoi2", "water"],
  唔該: ["m4 goi1", "please; thank you; excuse me"],
  咩: ["me1", "what"],
  呀: ["aa3", "question / emphasis particle"],
  嘅: ["ge3", "possessive / descriptive particle"],
  咗: ["zo2", "completed action"],
  喺: ["hai2", "at; in"],
  呢: ["ni1", "this"],
  啲: ["di1", "some"],
  係: ["hai6", "to be"],
  好: ["hou2", "good; very"],
  今日: ["gam1 jat6", "today"],
  奶茶: ["naai5 caa4", "milk tea"],
  我哋: ["ngo5 dei6", "we; us"],
  早晨: ["zou2 san4", "good morning"],
};
const phrases: Record<string, string> = {
  你好: "Hello.",
  早晨: "Good morning.",
  我想飲水: "I would like some water.",
  你想飲咩呀: "What would you like to drink?",
  你今日想食咩呀: "What would you like to eat today?",
  唔該埋單: "The bill, please.",
  我唔明: "I don’t understand.",
  我鍾意你: "I like you.",
  你可唔可以講多次: "Could you say that again?",
};
export function jyutping(chinese: string) {
  return ToJyutping.getJyutpingText(chinese)
    .replace(/\s+([，。！？,.!?])/g, "$1")
    .trim();
}
export function analyzeLocal(chinese: string) {
  const chars = Array.from(chinese);
  const words: Word[] = [];
  for (let i = 0; i < chars.length;) {
    if (!/\p{Script=Han}/u.test(chars[i])) {
      i++;
      continue;
    }
    let term = chars[i];
    for (let length = Math.min(12, chars.length - i); length > 1; length--) {
      const candidate = chars.slice(i, i + length).join("");
      if (common[candidate] || dictionary[candidate]) {
        term = candidate;
        break;
      }
    }
    const entry = common[term] ?? dictionary[term];
    words.push({
      chinese: term,
      jyutping: entry?.[0] || jyutping(term),
      definition: entry?.[1] || "Meaning unavailable — ask Natasha",
    });
    i += Array.from(term).length;
  }
  const clean = chinese.replace(/[^\p{Script=Han}]/gu, "");
  const exact = phrases[clean] || common[clean]?.[1] || dictionary[clean]?.[1];
  return {
    jyutping: jyutping(chinese),
    words,
    definition:
      exact || words.map((w) => w.definition.split(";")[0]).join(" · "),
    translation: exact ? "dictionary" : "word meanings",
  };
}
export async function translatePublic(chinese: string): Promise<string> {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.search = new URLSearchParams({
    client: "gtx",
    sl: "yue",
    tl: "en",
    dt: "t",
    q: chinese,
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
  if (!response.ok)
    throw new Error(`Translation unavailable (${response.status})`);
  const result: unknown = await response.json();
  if (!Array.isArray(result) || !Array.isArray(result[0]))
    throw new Error("Translation unavailable");
  const text = result[0]
    .map((x: unknown) =>
      Array.isArray(x) && typeof x[0] === "string" ? x[0] : "",
    )
    .join("")
    .trim();
  if (!text) throw new Error("Translation returned no text");
  return text;
}

/** A safe local fast path for exact dictionary phrases; ambiguous text uses JyutDeck. */
export function analyzeInputLocal(
  text: string,
  language: "english" | "jyutping",
) {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[.!?，。！？]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const input = normalize(text);
  for (const chinese of Object.keys(phrases)) {
    const result = analyzeLocal(chinese);
    if (
      normalize(language === "english" ? phrases[chinese] : result.jyutping) ===
      input
    )
      return { chinese, ...result };
  }
  for (const [chinese, entry] of Object.entries({ ...dictionary, ...common })) {
    if (
      normalize(language === "english" ? entry[1].split(";")[0] : entry[0]) ===
      input
    )
      return { chinese, ...analyzeLocal(chinese) };
  }
  return null;
}
