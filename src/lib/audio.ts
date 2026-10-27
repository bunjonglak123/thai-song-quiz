"use client";
// Playback through Web Audio:
//  - the volume slider drives a GainNode, which also works on iPhone
//    (iOS ignores <audio>.volume, so the old slider did nothing there)
//  - the slider is perceptual (cubic), so the bottom half is genuinely quiet
//  - the clip starts at an exact offset with a short fade-in
// The context must be created and resumed inside a tap, which unlockAudio() does.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

export type PlayResult = "ok" | "blocked" | "error" | "superseded";

const VOLUME_KEY = "tsq:volume-v2";
export const DEFAULT_VOLUME = 0.55; // slider position; actual gain = 0.55³ ≈ 0.17

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { src: AudioBufferSourceNode; fade: GainNode } | null = null;
let playToken = 0;
const buffers = new Map<string, Promise<AudioBuffer>>();

/** Slider position (0–1) to gain. Cubic feels even to the ear. */
export function sliderToGain(v: number) {
  const s = Math.min(Math.max(v, 0), 1);
  return s * s * s;
}

function context() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = sliderToGain(getVolume());
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a tap. Creates/resumes the audio context and primes it with silence. */
export function unlockAudio() {
  try {
    // Safari 16.4+: play even when the iPhone's silent switch is on, like a music app.
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {}
  try {
    const c = context();
    void c.resume();
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch {}
}

export function getVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null) return DEFAULT_VOLUME;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULT_VOLUME;
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function setVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_KEY, String(v));
  } catch {}
  if (ctx && master) master.gain.setTargetAtTime(sliderToGain(v), ctx.currentTime, 0.03);
}

function sourceUrl(url: string) {
  // Same-origin files (offline mock audio) load directly; Apple previews go through our relay.
  return url.startsWith("/") ? url : `/api/preview?u=${encodeURIComponent(url)}`;
}

function load(url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(sourceUrl(url))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => context().decodeAudioData(data));
    p.catch(() => buffers.delete(url)); // allow a retry
    buffers.set(url, p);
    if (buffers.size > 12) buffers.delete(buffers.keys().next().value!);
  }
  return p;
}

/** Start downloading/decoding a clip ahead of time. */
export function preloadClip(url: string) {
  if (ctx) load(url).catch(() => {});
}

/**
 * Play a preview from `startAt` seconds. Resolves once sound has started ("ok"),
 * or "blocked" if the browser needs a tap first, or "error" if the clip didn't load.
 */
export async function playClip(url: string, startAt: number): Promise<PlayResult> {
  const token = ++playToken;
  stopClip(false);
  let c: AudioContext;
  try {
    c = context();
  } catch {
    return "error";
  }
  if (c.state !== "running") {
    try {
      await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 400))]);
    } catch {}
  }
  if (c.state !== "running") return "blocked";

  let buf: AudioBuffer;
  try {
    buf = await load(url);
  } catch {
    return token === playToken ? "error" : "superseded";
  }
  if (token !== playToken) return "superseded";

  const fade = c.createGain();
  fade.gain.setValueAtTime(0, c.currentTime);
  fade.gain.linearRampToValueAtTime(1, c.currentTime + 0.25);
  fade.connect(master!);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(fade);
  src.start(0, Math.min(Math.max(startAt, 0), Math.max(0, buf.duration - 1)));
  current = { src, fade };
  return "ok";
}

export function stopClip(bumpToken = true) {
  if (bumpToken) playToken++;
  const cur = current;
  current = null;
  if (!cur || !ctx) return;
  try {
    cur.fade.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    cur.src.stop(ctx.currentTime + 0.3);
  } catch {}
}
