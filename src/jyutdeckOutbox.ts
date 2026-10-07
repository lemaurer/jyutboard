export type JyutDeckOutboxItem = {
  key: string;
  sessionId: string;
  cardId: string;
  parentId?: string;
  request: Record<string, unknown>;
  attempts: number;
  nextTryAt: number;
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = "jyutboard:jyutdeck-outbox:v1";

function load(): JyutDeckOutboxItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function save(items: JyutDeckOutboxItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-250)));
  } catch {
    // The lesson itself remains safe in Yjs even if browser storage is unavailable.
  }
}

export function jyutDeckOutboxKey(sessionId: string, cardId: string) {
  return `${sessionId}:${cardId}`;
}

export function ensureJyutDeckOutboxItem(
  item: Omit<JyutDeckOutboxItem, "attempts" | "nextTryAt" | "createdAt" | "updatedAt">,
) {
  const now = Date.now();
  const items = load();
  const index = items.findIndex((entry) => entry.key === item.key);
  if (index >= 0) {
    const previous = items[index];
    items[index] = {
      ...previous,
      ...item,
      updatedAt: now,
    };
  } else {
    items.push({
      ...item,
      attempts: 0,
      nextTryAt: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  save(items);
}

export function removeJyutDeckOutboxItem(key: string) {
  save(load().filter((item) => item.key !== key));
}

export function dueJyutDeckOutboxItems(sessionId: string, now = Date.now()) {
  return load()
    .filter((item) => item.sessionId === sessionId && item.nextTryAt <= now)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function retryJyutDeckOutboxItem(key: string) {
  const items = load();
  const index = items.findIndex((item) => item.key === key);
  if (index < 0) return;
  const attempts = items[index].attempts + 1;
  const delay = Math.min(60_000, 1_500 * 2 ** Math.min(attempts, 5));
  items[index] = {
    ...items[index],
    attempts,
    nextTryAt: Date.now() + delay,
    updatedAt: Date.now(),
  };
  save(items);
}
