export const PERSONAS = [
  { name: "Natasha", avatar: "natasha" },
  { name: "Leif", avatar: "leif" },
  { name: "Friend", avatar: "friend" },
  { name: "Teacher", avatar: "teacher" },
];
export function PersonAvatar({
  id = "natasha",
  name = "Person",
}: {
  id?: string;
  name?: string;
}) {
  const dark = id === "natasha" || id === "teacher";
  return (
    <svg
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${name} avatar`}
      className="person-avatar"
    >
      <circle cx="40" cy="40" r="37" fill={dark ? "#ffe1e5" : "#dcecff"} />
      <path
        d="M16 72Q17 51 40 51Q63 51 64 72"
        fill={dark ? "#ed869a" : "#6e9fe5"}
      />
      {dark && (
        <path d="M18 35Q16 8 40 9Q65 9 62 60L51 67L26 65Z" fill="#353046" />
      )}
      <ellipse cx="40" cy="35" rx="18" ry="23" fill="#ffd2a5" />
      <path
        d={
          dark
            ? "M21 31Q19 9 40 10Q62 10 59 29Q42 28 40 16Q36 28 21 31"
            : "M20 26Q20 9 36 12Q50 6 60 23L56 30L49 19Q33 27 20 26"
        }
        fill={dark ? "#353046" : "#b77a42"}
      />
      <circle cx="33" cy="36" r="2" fill="#453443" />
      <circle cx="48" cy="36" r="2" fill="#453443" />
      <path
        d="M34 46Q40 52 47 46"
        stroke="#bd5f69"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
