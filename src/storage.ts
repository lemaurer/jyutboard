import { z } from "zod";
import type { Session } from "./model";
const key = "jyutboard:sessions:v1";
export function sessions(): Session[] {
  try {
    return z
      .array(
        z.object({
          id: z.string().regex(/^[a-f0-9]{48}$/),
          title: z.string().max(100),
          created: z.number(),
          relay: z.string().optional(),
        }),
      )
      .parse(JSON.parse(localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}
export function remember(value: Session) {
  const list = sessions();
  const next = [value, ...list.filter((s) => s.id !== value.id)];
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}
export function loadPreference(key: string, fallback: string) {
  return localStorage.getItem(`jyutboard:${key}`) || fallback;
}
export function preference(key: string, value: string) {
  localStorage.setItem(`jyutboard:${key}`, value);
  if (
    key === "role" &&
    window.desktop?.web &&
    location.protocol === "https:" &&
    ["teacher", "learner"].includes(value)
  )
    document.cookie = `__Host-jyutboard_role=${value}; Path=/; Secure; SameSite=Strict; Max-Age=31536000`;
}
