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

// ---------------------------------------------------------------------------
// Sound effects, synthesised on the fly (no files to download). They go through the
// same master gain as the music, so the volume slider controls both.

const SFX_KEY = "tsq:sfx";
const SFX_LEVEL = 0.9; // relative to the music, before the master volume

export function getSfxEnabled() {
  try {
    return localStorage.getItem(SFX_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSfxEnabled(on: boolean) {
  try {
    localStorage.setItem(SFX_KEY, on ? "on" : "off");
  } catch {}
}

type Tone = {
  freq: number;
  to?: number; // pitch slide target
  dur: number; // seconds
  type?: OscillatorType;
  gain?: number;
  delay?: number; // seconds from now
};

function tones(list: Tone[]) {
  if (!getSfxEnabled()) return;
  let c: AudioContext;
  try {
    c = context();
  } catch {
    return;
  }
  // A tap resumes a suspended context; outside a tap this is harmless.
  if (c.state !== "running") void c.resume().catch(() => {});
  const t0 = c.currentTime + 0.005;
  for (const t of list) {
    const start = t0 + (t.delay ?? 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    const peak = (t.gain ?? 0.5) * SFX_LEVEL;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(g);
    g.connect(master!);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

// Pitch for each answer key, so ก ข ค ง sound different (C5 E5 G5 C6).
const PICK_NOTES = [523, 659, 784, 1047];

export const sfx = {
  /** Listening countdown: 3, 2, 1. */
  tick: () => tones([{ freq: 880, dur: 0.07, type: "triangle", gain: 0.45 }]),
  /** Last seconds of answer time: higher and sharper. */
  tickUrgent: () => tones([{ freq: 1320, dur: 0.06, type: "square", gain: 0.18 }]),
  /** Choices appear. */
  go: () =>
    tones([
      { freq: 784, dur: 0.12, type: "triangle", gain: 0.45 },
      { freq: 1175, dur: 0.22, type: "triangle", gain: 0.5, delay: 0.09 },
    ]),
  /** Time ran out. */
  timeUp: () =>
    tones([
      { freq: 392, to: 196, dur: 0.35, type: "sawtooth", gain: 0.16 },
      { freq: 392, to: 196, dur: 0.35, type: "triangle", gain: 0.3 },
    ]),
  /** Answer button: a short pop in that key's pitch. */
  pick: (i: number) =>
    tones([
      { freq: PICK_NOTES[i] ?? 600, to: (PICK_NOTES[i] ?? 600) * 1.5, dur: 0.09, type: "sine", gain: 0.6 },
      { freq: (PICK_NOTES[i] ?? 600) * 2, dur: 0.05, type: "triangle", gain: 0.15 },
    ]),
  /** Any other button. */
  click: () => tones([{ freq: 1400, to: 900, dur: 0.045, type: "triangle", gain: 0.25 }]),
};
