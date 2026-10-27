"use client";

// Player id is per browser tab (sessionStorage), so two tabs = two players when testing.
// The display name is remembered across visits (localStorage).

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRoomCode(len = 5) {
  const a = new Uint32Array(len);
  crypto.getRandomValues(a);
  return [...a].map((n) => CODE_CHARS[n % CODE_CHARS.length]).join("");
}

export function normalizeCode(s: string) {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function playerId(): string {
  try {
    let id = sessionStorage.getItem("tsq:pid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("tsq:pid", id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function savedName(): string {
  try {
    return localStorage.getItem("tsq:name") ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem("tsq:name", name);
  } catch {}
}

export function markHost(code: string) {
  try {
    sessionStorage.setItem(`tsq:host:${code}`, "1");
  } catch {}
}

export function isHostOf(code: string) {
  try {
    return sessionStorage.getItem(`tsq:host:${code}`) === "1";
  } catch {
    return false;
  }
}

/** Avatar colours players can pick (light enough for dark text on top). */
export const PLAYER_COLORS = [
  "#ff5fa2", // pink
  "#ff8a3d", // orange
  "#ffd447", // yellow
  "#b6e85c", // lime
  "#3fe0b5", // mint
  "#4fd1e8", // cyan
  "#62b6ff", // sky
  "#9b8cff", // violet
  "#d48cff", // lilac
  "#ff7a7a", // coral
  "#e8d7b0", // sand
  "#f2f0ff", // white
] as const;

export function savedColor(): string {
  try {
    const c = localStorage.getItem("tsq:color");
    if (c && (PLAYER_COLORS as readonly string[]).includes(c)) return c;
  } catch {}
  return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

export function saveColor(c: string) {
  try {
    localStorage.setItem("tsq:color", c);
  } catch {}
}

/** First visible character of a name; keeps Thai vowels and tone marks attached. */
export function initialOf(name: string) {
  const t = name.trim();
  if (!t) return "?";
  let parts: string[];
  try {
    parts = Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(t), (s) => s.segment);
  } catch {
    parts = Array.from(t);
  }
  // Thai leading vowels (เ แ โ ใ ไ) read wrong on their own: "เบิร์ด" → "เบ", not "เ".
  const n = /^[เแโใไ]/.test(parts[0]) && parts.length > 1 ? 2 : 1;
  return parts.slice(0, n).join("").toUpperCase();
}
