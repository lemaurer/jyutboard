export const AVATARS = [
  {
    id: "natasha",
    label: "Natasha",
    skin: "#eebc98",
    hair: "#292738",
    shirt: "#d97391",
    bg: "#f9e1eb",
    style: "long",
  },
  {
    id: "leif",
    label: "Leif",
    skin: "#f2c3a0",
    hair: "#b77640",
    shirt: "#6b93cc",
    bg: "#e1ecfa",
    style: "swept",
  },
  {
    id: "friend",
    label: "Maya",
    skin: "#b77756",
    hair: "#332b34",
    shirt: "#8b7dbb",
    bg: "#eee6fa",
    style: "curly",
  },
  {
    id: "teacher",
    label: "Kai",
    skin: "#e6b48f",
    hair: "#454351",
    shirt: "#5b9b94",
    bg: "#e0f1ec",
    style: "glasses",
  },
  {
    id: "hana",
    label: "Hana",
    skin: "#f2c6ae",
    hair: "#543f36",
    shirt: "#b9a252",
    bg: "#faf0d7",
    style: "bob",
  },
  {
    id: "leo",
    label: "Leo",
    skin: "#d89d75",
    hair: "#40302b",
    shirt: "#c27d61",
    bg: "#f7e5dc",
    style: "beard",
  },
  {
    id: "amira",
    label: "Amira",
    skin: "#ba7e60",
    hair: "#363048",
    shirt: "#768fb4",
    bg: "#e5eaf5",
    style: "wrap",
  },
  {
    id: "noah",
    label: "Noah",
    skin: "#e6b38e",
    hair: "#3c3844",
    shirt: "#7a9b68",
    bg: "#eaf2dd",
    style: "short",
  },
  {
    id: "mei",
    label: "Mei",
    skin: "#efc5a3",
    hair: "#242e3b",
    shirt: "#cf8790",
    bg: "#fae9e7",
    style: "bun",
  },
  {
    id: "sam",
    label: "Sam",
    skin: "#976348",
    hair: "#292735",
    shirt: "#9f8dcd",
    bg: "#ece6f6",
    style: "curly",
  },
  {
    id: "jun",
    label: "Jun",
    skin: "#dfaf8c",
    hair: "#323a43",
    shirt: "#779aa8",
    bg: "#e4f1f5",
    style: "glasses",
  },
  {
    id: "rose",
    label: "Rose",
    skin: "#edbc9e",
    hair: "#a4513e",
    shirt: "#8ba69a",
    bg: "#e4eee8",
    style: "bob",
  },
];
export const PERSONAS = [
  { name: "Natasha", avatar: "natasha" },
  { name: "Leif", avatar: "leif" },
  { name: "Friend", avatar: "friend" },
  { name: "Teacher", avatar: "teacher" },
  { name: "Waiter", avatar: "leo" },
  { name: "Shopkeeper", avatar: "mei" },
];
export function PersonAvatar({
  id = "natasha",
  name = "Person",
}: {
  id?: string;
  name?: string;
}) {
  const a = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  const long = ["long", "bob", "wrap"].includes(a.style);
  return (
    <svg
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${name} avatar`}
      className="person-avatar"
    >
      <circle cx="40" cy="40" r="38" fill={a.bg} />
      <path d="M12 72Q14 53 31 52H49Q66 53 68 72Z" fill={a.shirt} />
      <path d="M32 49V58Q40 65 48 58V49" fill={a.skin} />
      {long && (
        <path
          d="M17 35Q16 9 40 8Q65 9 63 36L66 66Q52 70 45 61H35Q25 70 14 65Z"
          fill={a.hair}
        />
      )}
      {a.style === "bun" && (
        <ellipse cx="42" cy="12" rx="13" ry="10" fill={a.hair} />
      )}
      <ellipse cx="23" cy="37" rx="4" ry="6" fill={a.skin} />
      <ellipse cx="57" cy="37" rx="4" ry="6" fill={a.skin} />
      <path
        d="M22 29Q22 13 40 13Q58 13 58 29V39Q57 56 40 58Q23 55 22 39Z"
        fill={a.skin}
      />
      <path
        d="M25 42Q27 52 40 55Q52 53 55 44Q52 58 40 59Q28 58 25 42"
        fill="#b16f56"
        opacity=".14"
      />
      {a.style === "curly" ? (
        <path
          d="M20 31Q12 22 21 18Q16 9 29 10Q35 1 43 10Q55 3 59 16Q68 22 60 31L54 22Q47 27 40 19Q32 29 26 23Z"
          fill={a.hair}
        />
      ) : a.style === "wrap" ? (
        <path
          d="M18 33Q17 9 40 8Q65 9 63 37L63 65L49 62Q59 50 57 31Q37 30 30 19Q28 30 23 36Q20 55 31 64L16 63Z"
          fill={a.hair}
        />
      ) : a.style === "bob" ? (
        <path
          d="M20 32Q17 9 40 9Q63 9 61 34L56 31L54 22Q38 30 21 31Z"
          fill={a.hair}
        />
      ) : (
        <path
          d="M20 31Q16 12 33 10Q49 5 60 20L59 31L54 27L49 18Q37 27 22 29Z"
          fill={a.hair}
        />
      )}
      <path
        d="M28 33Q32 31 36 33M45 33Q49 31 53 33"
        stroke={a.hair}
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="33" cy="38" rx="1.6" ry="2.2" fill="#332d36" />
      <ellipse cx="48" cy="38" rx="1.6" ry="2.2" fill="#332d36" />
      <path
        d="M40 39L38 44H42"
        stroke="#b47b60"
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
      <ellipse cx="29" cy="44" rx="4" ry="2" fill="#db8e83" opacity=".4" />
      <ellipse cx="52" cy="44" rx="4" ry="2" fill="#db8e83" opacity=".4" />
      {a.style === "beard" && (
        <path
          d="M24 41Q27 49 32 47L40 46L48 47Q54 46 56 41Q56 56 40 59Q25 55 24 41"
          fill={a.hair}
          opacity=".85"
        />
      )}
      <path
        d="M34 48Q40 52 47 48"
        stroke={a.style === "beard" ? "#f3c7ad" : "#a65f60"}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      {a.style === "glasses" && (
        <g fill="none" stroke={a.hair} strokeWidth="1.7">
          <rect x="25" y="34" width="13" height="10" rx="4" />
          <rect x="43" y="34" width="13" height="10" rx="4" />
          <path d="M38 38H43M22 37H25M56 37H59" />
        </g>
      )}
      <path
        d="M26 56L34 63L40 59L46 63L54 56"
        stroke="#ffffff"
        strokeOpacity=".55"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
