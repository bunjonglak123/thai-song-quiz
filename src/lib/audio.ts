"use client";
// One shared <audio> element. Mobile Safari only lets an element play sound if it
// was first played inside a tap, so we "unlock" it on the join button and reuse it.

const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let el: HTMLAudioElement | null = null;
let playToken = 0;

function audio() {
  if (!el) {
    el = new Audio();
    el.preload = "auto";
    el.volume = getVolume();
  }
  return el;
}

export function unlockAudio() {
  const a = audio();
  a.src = SILENCE;
  a.play().catch(() => {});
}

export function getVolume() {
  try {
    const v = Number(localStorage.getItem("tsq:volume"));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8;
  } catch {
    return 0.8;
  }
}

export function setVolume(v: number) {
  audio().volume = v;
  try {
    localStorage.setItem("tsq:volume", String(v));
  } catch {}
}

/**
 * Play a preview from `startAt` seconds. Resolves to true once sound is playing,
 * false if the browser blocked it (caller shows a "tap to play" button).
 */
export async function playClip(url: string, startAt: number): Promise<boolean> {
  const a = audio();
  const token = ++playToken;
  a.pause();
  a.src = startAt > 0 ? `${url}#t=${startAt}` : url;
  const seek = () => {
    if (startAt > 0 && Math.abs(a.currentTime - startAt) > 1) {
      try {
        a.currentTime = startAt;
      } catch {}
    }
  };
  a.addEventListener("loadedmetadata", seek, { once: true });
  try {
    await a.play();
    return token === playToken;
  } catch {
    return false;
  }
}

/** Resolves when the shared element actually starts producing sound (or after maxMs). */
export function whenPlaying(maxMs = 2500): Promise<void> {
  const a = audio();
  if (!a.paused && a.currentTime > 0 && a.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      a.removeEventListener("playing", done);
      resolve();
    };
    const t = setTimeout(done, maxMs);
    a.addEventListener("playing", done, { once: true });
  });
}

export function stopClip() {
  playToken++;
  el?.pause();
}
