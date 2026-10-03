import { useState, type ReactNode } from "react";
type Sticker = {
  id: string;
  name: string;
  category: string;
  outline: string;
  fill: string;
  art: ReactNode;
};
const line = {
  fill: "none",
  stroke: "#48536a",
  strokeWidth: 3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const food = "#f8c16d",
  green = "#9fd6ad",
  blue = "#a8cef6",
  pink = "#f7afbf";
export const STICKERS: Sticker[] = [
  {
    id: "noodles",
    name: "Noodle bowl",
    category: "Food",
    outline: "M8 43 L92 43 Q85 92 50 92 Q15 92 8 43 Z",
    fill: "#fbba9d",
    art: (
      <>
        <path
          d="M14 47 Q50 31 86 47 M22 52 Q50 39 78 52 M26 59 Q50 47 74 59"
          {...line}
          stroke="#f4df96"
          strokeWidth="5"
        />
        <path d="M27 34 L65 10 M34 38 L72 14" {...line} />
        <circle cx="51" cy="68" r="6" fill={green} />
      </>
    ),
  },
  {
    id: "dumplings",
    name: "Dumplings",
    category: "Food",
    outline:
      "M5 75 Q4 52 28 33 Q48 14 63 31 Q85 40 96 70 Q96 90 52 93 Q10 94 5 75 Z",
    fill: "#f7d99c",
    art: (
      <>
        <path
          d="M13 66 Q32 25 52 47 Q67 36 88 69 M23 61 L27 47 M34 55 L40 40 M52 66 L58 49 M67 71 L73 55"
          {...line}
          stroke="#c39352"
        />
        <path d="M17 79 Q50 92 83 78" {...line} />
      </>
    ),
  },
  {
    id: "rice",
    name: "Rice bowl",
    category: "Food",
    outline:
      "M10 43 Q15 23 32 28 Q46 13 59 26 Q83 17 90 43 L94 49 Q85 93 50 93 Q15 93 6 49 Z",
    fill: "#aad7cd",
    art: (
      <>
        <path d="M12 44 Q50 57 88 44" {...line} />
        <path
          d="M28 34 L34 31 M46 29 L52 33 M64 34 L70 30"
          {...line}
          stroke="white"
          strokeWidth="5"
        />
        <path d="M38 69 Q50 79 62 69" {...line} />
      </>
    ),
  },
  {
    id: "bun",
    name: "Steamed bun",
    category: "Food",
    outline:
      "M8 71 Q8 44 31 27 Q48 10 65 25 Q92 42 92 71 Q91 91 50 94 Q9 91 8 71 Z",
    fill: "#ffe4b8",
    art: (
      <>
        <path
          d="M32 33 L48 42 L66 32 M48 42 L49 66 M27 46 Q18 61 22 73 M74 47 Q84 61 79 74"
          {...line}
          stroke="#ceab80"
        />
      </>
    ),
  },
  {
    id: "egg-tart",
    name: "Egg tart",
    category: "Food",
    outline:
      "M9 34 L20 15 L35 13 L50 6 L65 13 L81 15 L92 34 L91 65 L80 85 L63 88 L50 94 L34 88 L19 85 L8 65 Z",
    fill: "#dfa868",
    art: (
      <>
        <ellipse cx="50" cy="43" rx="32" ry="26" fill="#ffdb63" />
        <path
          d="M22 69 L25 82 M38 74 L39 89 M60 74 L59 88 M77 69 L75 82"
          {...line}
          stroke="#b27c45"
        />
      </>
    ),
  },
  {
    id: "toast",
    name: "Toast",
    category: "Food",
    outline:
      "M18 42 Q2 27 18 12 Q34 2 50 10 Q67 2 82 12 Q97 27 82 42 L82 91 L18 91 Z",
    fill: "#d7a169",
    art: (
      <>
        <path
          d="M26 42 Q13 29 25 20 Q37 13 50 20 Q66 12 76 21 Q88 29 74 42 L74 83 L26 83 Z"
          fill="#ffe3a5"
        />
        <rect
          x="40"
          y="44"
          width="25"
          height="24"
          rx="4"
          fill="#ffe56d"
          transform="rotate(-12 50 55)"
        />
      </>
    ),
  },
  {
    id: "apple",
    name: "Apple",
    category: "Food",
    outline:
      "M48 28 Q22 14 10 36 Q0 69 28 91 Q42 99 50 90 Q61 99 74 91 Q102 61 87 35 Q73 16 51 28 L52 12 L64 5 L74 8 L62 22 Z",
    fill: "#ef8f91",
    art: (
      <>
        <path d="M52 24 Q64 4 82 9 Q77 24 56 26" fill={green} />
        <path
          d="M22 42 Q13 58 25 73"
          {...line}
          stroke="#fff3e9"
          strokeWidth="5"
        />
      </>
    ),
  },
  {
    id: "orange",
    name: "Orange",
    category: "Food",
    outline:
      "M50 24 Q6 16 7 59 Q4 95 49 96 Q93 95 94 59 Q94 26 63 24 L79 8 L61 4 L49 18 Z",
    fill: "#ffbe67",
    art: (
      <>
        <path d="M51 23 Q65 4 83 12 Q79 27 54 29" fill={green} />
        <circle cx="29" cy="55" r="2" fill="#db9748" />
        <circle cx="38" cy="73" r="2" fill="#db9748" />
        <path
          d="M18 44 Q12 59 23 72"
          {...line}
          stroke="#fff3ce"
          strokeWidth="5"
        />
      </>
    ),
  },
  {
    id: "fish",
    name: "Fish",
    category: "Food",
    outline: "M7 49 L22 34 L22 42 Q60 9 94 50 Q60 91 22 60 L22 68 Z",
    fill: "#95cbd8",
    art: (
      <>
        <path
          d="M67 32 Q54 49 67 68 M34 43 L42 50 L34 57 M48 36 L55 43 L48 50"
          {...line}
        />
        <circle cx="78" cy="45" r="3" fill="#48536a" />
      </>
    ),
  },
  {
    id: "tea",
    name: "Tea cup",
    category: "Drinks",
    outline:
      "M12 29 L67 29 L67 36 Q95 29 95 53 Q95 77 68 70 Q63 90 40 92 Q13 91 12 66 Z",
    fill: "#a2d6c4",
    art: (
      <>
        <path
          d="M69 44 Q85 38 85 53 Q85 65 70 61 M24 35 Q41 42 60 35"
          {...line}
        />
        <path d="M30 63 Q42 75 55 62" {...line} />
      </>
    ),
  },
  {
    id: "coffee",
    name: "Coffee to go",
    category: "Drinks",
    outline: "M20 19 L80 19 L84 30 L79 40 L70 94 L30 94 L21 40 L16 30 Z",
    fill: "#edc39b",
    art: (
      <>
        <path d="M19 24 L82 24 M24 42 L77 42" {...line} />
        <path d="M29 50 L73 50 L69 77 L33 77 Z" fill="#f8efe1" />
        <path
          d="M47 57 Q61 55 58 65 Q54 73 45 70 Q39 65 47 57 Z"
          fill="#96745b"
        />
      </>
    ),
  },
  {
    id: "water",
    name: "Water glass",
    category: "Drinks",
    outline: "M23 8 L77 8 L70 94 L30 94 Z",
    fill: "#d4e9fb",
    art: (
      <>
        <path d="M27 37 Q50 46 73 37 L68 88 L32 88 Z" fill="#8ebded" />
        <path
          d="M33 18 L35 30 M39 52 L41 78"
          {...line}
          stroke="white"
          strokeWidth="5"
        />
      </>
    ),
  },
  {
    id: "milk-tea",
    name: "Milk tea",
    category: "Drinks",
    outline:
      "M48 4 L57 4 L57 22 L80 22 L83 33 L76 94 L24 94 L17 33 L20 22 L48 22 Z",
    fill: "#dba575",
    art: (
      <>
        <path d="M22 27 L77 27 M25 43 L75 43" {...line} />
        <path d="M31 47 L68 47 L65 70 L35 70 Z" fill="#fff0d7" />
        <path
          d="M35 82 L36 82 M49 85 L50 85 M63 81 L64 81"
          {...line}
          strokeWidth="8"
        />
      </>
    ),
  },
  {
    id: "bus",
    name: "Bus",
    category: "Travel",
    outline:
      "M9 17 Q9 7 23 7 L78 7 Q91 7 91 19 L91 80 L82 80 L82 94 L66 94 L66 80 L34 80 L34 94 L18 94 L18 80 L9 80 Z",
    fill: "#9fc6ef",
    art: (
      <>
        <rect x="18" y="24" width="64" height="31" rx="4" fill="#e9f7ff" />
        <path d="M49 25 L49 54 M17 68 L29 68 M72 68 L84 68" {...line} />
        <path d="M33 15 L67 15" {...line} />
      </>
    ),
  },
  {
    id: "tram",
    name: "Tram",
    category: "Travel",
    outline:
      "M46 3 L54 3 L54 14 L82 14 L90 76 L76 84 L84 95 L72 95 L64 85 L36 85 L28 95 L16 95 L24 84 L10 76 L18 14 L46 14 Z",
    fill: "#9ad3b2",
    art: (
      <>
        <path d="M24 22 L76 22 L80 49 L20 49 Z" fill="#f1f7e7" />
        <path d="M48 23 L48 48 M20 63 L80 63" {...line} />
        <circle cx="50" cy="74" r="5" fill="#f9d889" />
      </>
    ),
  },
  {
    id: "train",
    name: "Train",
    category: "Travel",
    outline:
      "M19 18 Q19 6 32 6 L68 6 Q81 6 81 18 L81 75 L67 86 L80 95 L63 95 L54 86 L46 86 L37 95 L20 95 L33 86 L19 75 Z",
    fill: "#b9b1e2",
    art: (
      <>
        <rect x="27" y="23" width="46" height="32" rx="6" fill="#eef4ff" />
        <path d="M35 15 L65 15" {...line} />
        <circle cx="33" cy="68" r="5" fill="#ffe49d" />
        <circle cx="67" cy="68" r="5" fill="#ffe49d" />
      </>
    ),
  },
  {
    id: "boat",
    name: "Boat",
    category: "Travel",
    outline:
      "M8 64 L41 64 L41 8 L48 4 L90 58 L49 58 L49 64 L94 64 L79 91 L23 91 Z",
    fill: "#9fcee6",
    art: (
      <>
        <path d="M45 13 L45 55 L79 55 Z" fill="#fff0cb" />
        <path d="M20 74 L82 74 M31 85 L71 85" {...line} stroke="white" />
      </>
    ),
  },
  {
    id: "plane",
    name: "Plane",
    category: "Travel",
    outline:
      "M46 7 Q50 0 54 7 L57 38 L93 60 L92 69 L58 57 L57 80 L72 88 L70 96 L50 89 L30 96 L28 88 L43 80 L42 57 L8 69 L7 60 L43 38 Z",
    fill: "#bdd8f5",
    art: (
      <path
        d="M49 20 L51 20 M49 35 L51 35 M49 54 L51 54"
        {...line}
        strokeWidth="5"
      />
    ),
  },
  {
    id: "house",
    name: "Home",
    category: "Everyday",
    outline: "M4 44 L50 6 L96 44 L86 53 L81 49 L81 93 L19 93 L19 49 L14 53 Z",
    fill: "#efbaa3",
    art: (
      <>
        <path d="M17 42 L50 17 L83 42" {...line} stroke="#b38273" />
        <rect x="39" y="58" width="23" height="35" rx="3" fill="#a9bfdb" />
        <rect x="26" y="51" width="12" height="14" rx="2" fill="#fff3ce" />
      </>
    ),
  },
  {
    id: "book",
    name: "Book",
    category: "Everyday",
    outline:
      "M10 14 Q31 7 50 19 Q69 7 90 14 L90 85 Q68 78 50 92 Q32 78 10 85 Z",
    fill: "#b6a9df",
    art: (
      <>
        <path
          d="M17 21 Q34 18 46 27 L46 81 Q32 72 17 77 Z M83 21 Q66 18 54 27 L54 81 Q68 72 83 77 Z"
          fill="#fff7e5"
        />
        <path
          d="M22 37 L39 40 M22 48 L39 51 M61 40 L77 36 M61 51 L77 48"
          {...line}
          stroke="#b4a896"
          strokeWidth="2"
        />
      </>
    ),
  },
  {
    id: "pencil",
    name: "Pencil",
    category: "Everyday",
    outline: "M73 5 L95 27 L31 91 L5 96 L10 70 Z",
    fill: "#ffd078",
    art: (
      <>
        <path d="M65 14 L86 35 M15 67 L36 88" {...line} />
        <path d="M26 72 L74 24" {...line} stroke="#fff0c6" strokeWidth="7" />
        <path d="M10 78 L23 91 L6 95 Z" fill="#5d5a67" />
      </>
    ),
  },
  {
    id: "clock",
    name: "Clock",
    category: "Everyday",
    outline: "M50 5 A45 45 0 1 1 49.9 5 Z",
    fill: "#aecbd5",
    art: (
      <>
        <circle cx="50" cy="50" r="35" fill="#fff6e5" />
        <path
          d="M50 22 L50 50 L69 60 M19 50 L23 50 M77 50 L81 50 M50 77 L50 81"
          {...line}
        />
      </>
    ),
  },
  {
    id: "bag",
    name: "Shopping bag",
    category: "Everyday",
    outline: "M30 29 Q30 4 50 4 Q70 4 70 29 L82 29 L92 94 L8 94 L18 29 Z",
    fill: "#f0b4c8",
    art: (
      <>
        <path d="M38 29 Q37 13 50 13 Q63 13 62 29" fill="#fff" />
        <path d="M31 36 Q30 53 38 55 M69 36 Q70 53 62 55" {...line} />
        <path d="M41 64 Q50 77 59 64" {...line} />
      </>
    ),
  },
  {
    id: "umbrella",
    name: "Umbrella",
    category: "Everyday",
    outline:
      "M8 47 Q9 7 50 7 Q91 7 92 47 L75 43 L60 49 L54 46 L54 83 Q54 97 40 97 Q25 97 27 80 L36 80 Q34 89 42 88 Q46 88 46 83 L46 46 L40 49 L24 43 Z",
    fill: "#aabfe9",
    art: (
      <>
        <path
          d="M50 13 Q27 23 25 43 M50 13 Q72 23 75 43 M50 13 L50 43"
          {...line}
          stroke="#eef4ff"
        />
      </>
    ),
  },
  {
    id: "sun",
    name: "Sunshine",
    category: "Nature",
    outline:
      "M45 5 L55 5 L58 19 L70 10 L79 19 L71 31 L90 29 L95 39 L82 49 L95 61 L90 71 L72 69 L79 82 L70 90 L58 81 L55 96 L45 96 L42 81 L29 90 L21 82 L29 69 L10 71 L5 61 L18 49 L5 39 L10 29 L29 31 L21 19 L29 10 L42 19 Z",
    fill: "#ffd378",
    art: (
      <>
        <circle cx="50" cy="50" r="25" fill="#ffe39b" />
        <circle cx="40" cy="47" r="3" fill="#68604e" />
        <circle cx="60" cy="47" r="3" fill="#68604e" />
        <path d="M40 59 Q50 67 60 59" {...line} />
      </>
    ),
  },
  {
    id: "cloud",
    name: "Cloud",
    category: "Nature",
    outline:
      "M20 77 Q0 73 8 50 Q13 38 28 42 Q28 15 52 17 Q71 17 77 39 Q96 38 96 58 Q98 79 80 80 Z",
    fill: "#d4e4f4",
    art: (
      <>
        <path
          d="M23 58 Q26 53 30 58 M64 58 Q68 53 72 58 M42 65 Q49 72 56 65"
          {...line}
        />
      </>
    ),
  },
  {
    id: "flower",
    name: "Flower",
    category: "Nature",
    outline:
      "M43 59 Q20 65 16 49 Q2 36 19 25 Q21 5 41 15 Q54 1 64 17 Q84 10 88 29 Q100 47 78 55 Q73 68 56 59 L56 77 Q70 62 88 70 Q84 89 56 88 L55 97 L44 97 L43 86 Q18 89 12 70 Q33 61 43 77 Z",
    fill: "#f2b5c9",
    art: (
      <>
        <circle cx="51" cy="36" r="15" fill="#ffe492" />
        <path
          d="M49 64 L49 94 M45 80 L24 76 M56 82 L77 74"
          {...line}
          stroke="#6ca982"
        />
      </>
    ),
  },
  {
    id: "leaf",
    name: "Leaf",
    category: "Nature",
    outline: "M11 81 Q8 18 89 8 Q94 84 23 87 L15 98 L6 91 Z",
    fill: "#a3d2a0",
    art: (
      <path
        d="M18 82 L73 27 M38 60 L32 35 M51 46 L52 24 M38 60 L67 66 M51 46 L76 47"
        {...line}
        stroke="#568b66"
      />
    ),
  },
  {
    id: "mountain",
    name: "Mountains",
    category: "Nature",
    outline: "M4 91 L34 21 L49 43 L67 7 L96 91 Z",
    fill: "#aac7c3",
    art: (
      <>
        <path
          d="M25 43 L34 21 L44 43 L37 40 L33 46 Z M53 36 L67 7 L79 37 L69 30 L62 40 Z"
          fill="#fff8ed"
        />
        <path d="M16 82 L83 82" {...line} stroke="#789b96" />
      </>
    ),
  },
  {
    id: "heart",
    name: "Heart",
    category: "Teaching",
    outline:
      "M50 90 Q3 59 5 29 Q9 0 34 10 Q45 14 50 25 Q58 5 77 8 Q98 12 95 36 Q92 62 50 90 Z",
    fill: "#ec9ba9",
    art: (
      <path
        d="M18 26 Q24 16 35 23"
        {...line}
        stroke="#fff2e8"
        strokeWidth="6"
      />
    ),
  },
  {
    id: "star",
    name: "Gold star",
    category: "Teaching",
    outline:
      "M50 5 L64 33 L95 39 L72 61 L77 93 L50 77 L23 93 L28 61 L5 39 L36 33 Z",
    fill: "#ffd574",
    art: (
      <>
        <path d="M34 49 L37 49 M63 49 L66 49" {...line} strokeWidth="5" />
        <path d="M40 61 Q50 72 60 61" {...line} />
      </>
    ),
  },
  {
    id: "lightbulb",
    name: "Idea",
    category: "Teaching",
    outline:
      "M36 71 Q9 52 19 29 Q26 6 50 6 Q76 6 83 30 Q92 53 64 71 L64 88 L56 96 L44 96 L36 88 Z",
    fill: "#ffdc87",
    art: (
      <>
        <path
          d="M37 75 L63 75 M39 84 L61 84 M48 74 L43 41 L50 47 L57 41 L52 74"
          {...line}
        />
        <path
          d="M31 28 Q39 16 53 19"
          {...line}
          stroke="#fff7da"
          strokeWidth="5"
        />
      </>
    ),
  },
  {
    id: "question",
    name: "Question",
    category: "Teaching",
    outline:
      "M50 5 Q95 5 95 48 Q95 85 61 87 L34 97 L36 85 Q5 80 5 48 Q5 5 50 5 Z",
    fill: "#b4b9ed",
    art: (
      <>
        <path
          d="M36 33 Q40 22 51 23 Q67 23 66 35 Q66 43 54 46 L50 55"
          {...line}
          stroke="white"
          strokeWidth="7"
        />
        <circle cx="50" cy="68" r="4" fill="white" />
      </>
    ),
  },
  {
    id: "check",
    name: "Well done",
    category: "Teaching",
    outline: "M50 5 A45 45 0 1 1 49.9 5 Z",
    fill: "#95ceb7",
    art: (
      <path d="M26 50 L43 68 L76 33" {...line} stroke="white" strokeWidth="9" />
    ),
  },
  {
    id: "bear",
    name: "Bear",
    category: "Animals",
    outline:
      "M18 33 Q1 22 11 9 Q24 0 34 15 Q49 9 66 15 Q77 1 89 9 Q99 25 83 34 Q95 51 88 74 Q80 96 50 96 Q17 95 10 72 Q4 49 18 33 Z",
    fill: "#cba382",
    art: (
      <>
        <ellipse cx="50" cy="65" rx="20" ry="15" fill="#f8ddbd" />
        <circle cx="30" cy="45" r="4" fill="#4e4545" />
        <circle cx="70" cy="45" r="4" fill="#4e4545" />
        <path d="M44 59 L56 59 L50 65 Z" fill="#4e4545" />
        <path d="M50 66 L50 73 M40 72 Q50 78 60 72" {...line} />
      </>
    ),
  },
  {
    id: "raccoon",
    name: "Raccoon",
    category: "Animals",
    outline:
      "M18 35 L8 7 L34 17 Q51 9 67 18 L92 7 L82 36 Q96 57 85 80 Q72 97 50 97 Q25 96 14 78 Q4 55 18 35 Z",
    fill: "#b1b9c4",
    art: (
      <>
        <path
          d="M16 43 Q29 27 47 45 L50 56 L53 45 Q72 28 84 43 L77 65 L53 64 L50 58 L47 64 L23 65 Z"
          fill="#596476"
        />
        <circle cx="32" cy="50" r="4" fill="white" />
        <circle cx="68" cy="50" r="4" fill="white" />
        <ellipse cx="50" cy="75" rx="15" ry="11" fill="#eef0ea" />
        <path d="M44 69 L56 69 L50 76 Z" fill="#465268" />
      </>
    ),
  },
];
const legacy: Record<string, string> = {
  "⭐": "star",
  "💡": "lightbulb",
  "❓": "question",
  "❤️": "heart",
  "👏": "check",
  "🍜": "noodles",
  "☕": "tea",
  "🎯": "check",
  "✨": "star",
  "🦝": "raccoon",
  "🐻": "bear",
  "🎉": "flower",
};
export function getSticker(id: string) {
  return (
    STICKERS.find((item) => item.id === (legacy[id] ?? id)) ??
    STICKERS.find((item) => item.id === "star")!
  );
}
export function StickerArt({
  id,
  selected = false,
}: {
  id: string;
  selected?: boolean;
}) {
  const item = getSticker(id);
  return (
    <svg
      className="sticker-art"
      viewBox="0 0 100 100"
      role="img"
      aria-label={item.name}
    >
      <g className="sticker-ink">
        <path
          className="sticker-silhouette"
          d={item.outline}
          fill={item.fill}
          stroke={selected ? "#3159e8" : "white"}
          strokeWidth={selected ? 3 : 2}
          strokeLinejoin="round"
        />
        {item.art}
      </g>
    </svg>
  );
}
export function StickerLibrary({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (id: string) => void;
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  return (
    <div className="sticker-library">
      <input
        aria-label="Find stickers"
        placeholder="Find a sticker…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="sticker-categories">
        {["All", ...new Set(STICKERS.map((item) => item.category))].map(
          (name) => (
            <button
              key={name}
              className={category === name ? "active" : ""}
              onClick={() => setCategory(name)}
            >
              {name}
            </button>
          ),
        )}
      </div>
      <div className="sticker-grid">
        {STICKERS.filter(
          (item) =>
            (category === "All" || category === item.category) &&
            item.name.toLowerCase().includes(query.toLowerCase()),
        ).map((item) => (
          <button
            key={item.id}
            title={item.name}
            aria-label={`Sticker ${item.name}`}
            className={getSticker(selected).id === item.id ? "active" : ""}
            onClick={() => onPick(item.id)}
          >
            <StickerArt id={item.id} />
            <span>{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
