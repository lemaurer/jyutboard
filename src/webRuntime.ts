import { ROOM_PATTERN, validateRelay } from "./model";
export const WEB_APP_URL = "https://jyutboard.vercel.app/";
const pairKey = "jyutboard:web-pair:v1";
type Pair = { room: string; host: false; relay?: string };
// Safari copies cookies into a newly installed Home Screen app, but not
// localStorage/IndexedDB. Carry only the room capability across that boundary.
const installCookie = "__Host-jyutboard_pair";
export function storedPair(): Pair | null {
  try {
    const p = JSON.parse(localStorage.getItem(pairKey) || "null");
    if (p && ROOM_PATTERN.test(p.room)) return { ...p, host: false };
  } catch {
    /* Fall back to the installation cookie. */
  }
  const room = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(installCookie + "="))
    ?.slice(installCookie.length + 1);
  return room && ROOM_PATTERN.test(room) ? { room, host: false } : null;
}
function carryPair(room?: string) {
  if (location.protocol !== "https:") return;
  document.cookie = `${installCookie}=${room || ""}; Path=/; Secure; SameSite=Strict; Max-Age=${room ? 31536000 : 0}`;
}
export function webInvitation(room: string, relay: string) {
  validateRelay(relay);
  if (!ROOM_PATTERN.test(room)) throw Error("Invalid room");
  if (!relay.startsWith("wss://"))
    throw Error("iPad joining needs an Internet lesson.");
  return `${WEB_APP_URL}#${new URLSearchParams({ room, relay })}`;
}
export function installWebRuntime() {
  if (window.desktop) return;
  document.documentElement.classList.add("web-client");
  if (!localStorage.getItem("jyutboard:role")) {
    const copiedRole = document.cookie
      .split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith("__Host-jyutboard_role="))
      ?.split("=")[1];
    if (copiedRole === "teacher" || copiedRole === "learner")
      localStorage.setItem("jyutboard:role", copiedRole);
  }
  async function api(action: string, fields: Record<string, unknown> = {}) {
    const room =
      typeof fields.room === "string" ? fields.room : storedPair()?.room;
    if (!room) throw Error("Join your partner’s Internet lesson first.");
    const response = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, room, ...fields }),
      cache: "no-store",
      signal: AbortSignal.timeout(action === "send" ? 300000 : 90000),
    });
    const data = await response.json();
    if (!response.ok && response.status !== 207)
      throw Error(data.error || "Lesson service unavailable. Retry shortly.");
    return data;
  }
  const nativeOnly = async () => {
    throw Error("Open the Mac or Windows app to host the lesson.");
  };
  window.desktop = {
    web: true,
    vocabulary: () => api("vocabulary"),
    transcribe: (audio) => api("transcribe", { audio }),
    analyze: (text, language) => api("analyze", { text, language }),
    send: (payload) => api("send", { payload }),
    pair: async (value) => {
      if (value.action === "get") return storedPair();
      if (value.action === "forget") {
        localStorage.removeItem(pairKey);
        carryPair();
        return null;
      }
      if (value.action === "remember") {
        if (!value.room || !ROOM_PATTERN.test(value.room))
          throw Error("Invalid lesson invitation.");
        const pair: Pair = {
          room: value.room,
          host: false,
          relay: value.relay,
        };
        localStorage.setItem(pairKey, JSON.stringify(pair));
        carryPair(pair.room);
        return pair;
      }
      if (value.action === "resolve") {
        const data = await api("resolve", {
          room: value.room || storedPair()?.room,
        });
        validateRelay(data.relay);
        if (location.protocol === "https:" && !data.relay.startsWith("wss://"))
          throw Error("Your partner needs to start an Internet lesson.");
        return { ...storedPair(), relay: data.relay };
      }
      return nativeOnly();
    },
    getSettings: async () => ({
      queueUrl: "/api/board",
      hasQueueToken: false,
      hasGoogleKey: false,
    }),
    saveSettings: nativeOnly,
    clearSettings: async () => true,
    host: nativeOnly,
    hostRemote: nativeOnly,
    stopRemote: async () => true,
    microphone: async () => {
      if (!isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw Error("Microphone access needs Safari over HTTPS.");
      return true;
    },
    translate: async (text) => {
      const url = new URL(
        "https://translate.googleapis.com/translate_a/single",
      );
      url.search = new URLSearchParams({
        client: "gtx",
        sl: "yue",
        tl: "en",
        dt: "t",
        q: text,
      }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw Error("Translation unavailable");
      const data = await response.json();
      return data[0].map((part: unknown[]) => part[0] || "").join("");
    },
    saveBackup: async (text) => {
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "JyutBoard-lesson.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    },
  };
}
