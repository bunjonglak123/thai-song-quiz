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
