// Pure helpers for turning raw song lists into quiz questions.
// No network access here, so everything can be unit tested.

import type { Choice, HostQuestion, Track } from "./types";

export type PoolTrack = Track & { group: string };

/** Versions that make bad quiz questions (or duplicate the original). */
const ALT_VERSION =
  /\b(live|acoustic|unplugged|instrumental|karaoke|remix|sped ?up|slowed|nightcore|cover|demo|minus ?one|backing track|version|session)\b|\b(inst|ver)\.|คาราโอเกะ|เวอร์ชั่น|เวอร์ชัน|อะคูสติก|แสดงสด|ดนตรี ?ล้วน|รีมิกซ์|มินัส/i;

const LIVE_ALBUM = /\b(live|concert|unplugged)\b|คอนเสิร์ต|แสดงสด/i;

export function isAltVersion(rawTitle: string, album?: string): boolean {
  if (ALT_VERSION.test(rawTitle)) return true;
  if (album && LIVE_ALBUM.test(album)) return true;
  return false;
}

/** Strip "(feat. X)", "[From ...]", "(เพลงประกอบละคร ...)", " - From ..." etc. */
export function cleanTitle(raw: string): string {
  let t = raw
    .replace(/\s*[\(\[【（][^\)\]】）]*[\)\]】）]/g, "")
    .replace(/\s+[-–—]\s+(from|feat\.?|ft\.?|เพลงประกอบ|ost).*$/i, "")
    .replace(/\s+(feat\.?|ft\.?)\s.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!t) t = raw.trim();
  return t;
}

/** Comparison key: lowercase, no spaces/punctuation, Thai and Latin kept. */
export function normKey(s: string): string {
  return cleanTitle(s)
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

export function dedupeTracks<T extends Track>(tracks: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const t of tracks) {
    const k = normKey(t.title) + "|" + normKey(t.artist);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export type Rng = () => number;

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type BuildResult = {
  questions: HostQuestion[];
  warnings: string[];
};

/**
 * Build `rounds` 4-choice questions from a pool.
 * - Answers are spread across groups (one group per artist, or "chart").
 * - Wrong choices come from the same group first, so artist rounds are hard.
 * - No two choices in a question share the same title.
 */
export function buildQuestions(
  pool: PoolTrack[],
  rounds: number,
  roundSeconds: number,
  rng: Rng = Math.random,
): BuildResult {
  const warnings: string[] = [];
  const clean = dedupeTracks(pool.filter((t) => t.previewUrl));
  const distinctTitles = new Set(clean.map((t) => normKey(t.title)));
  if (distinctTitles.size < 4) {
    return {
      questions: [],
      warnings: ["เพลงที่มีตัวอย่างให้ฟังน้อยเกินไป (ต้องมีอย่างน้อย 4 เพลง) ลองเพิ่มศิลปินหรือเปลี่ยนชื่อที่ค้นหา"],
    };
  }

  // Group tracks, then pick answers round-robin across groups.
  const groups = new Map<string, PoolTrack[]>();
  for (const t of shuffle(clean, rng)) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group)!.push(t);
  }
  const groupOrder = shuffle([...groups.keys()], rng);
  const cursors = new Map(groupOrder.map((g) => [g, 0]));
  const usedTitles = new Set<string>();
  const answers: PoolTrack[] = [];
  let progressed = true;
  while (answers.length < rounds && progressed) {
    progressed = false;
    for (const g of groupOrder) {
      if (answers.length >= rounds) break;
      const list = groups.get(g)!;
      let i = cursors.get(g)!;
      while (i < list.length && usedTitles.has(normKey(list[i].title))) i++;
      if (i < list.length) {
        answers.push(list[i]);
        usedTitles.add(normKey(list[i].title));
        progressed = true;
        i++;
      }
      cursors.set(g, i);
    }
  }
  if (answers.length < rounds) {
    warnings.push(`มีเพลงพอสำหรับ ${answers.length} ข้อ จากที่ตั้งไว้ ${rounds} ข้อ`);
  }

  const maxStart = Math.max(0, Math.min(12, 29 - roundSeconds));

  const questions: HostQuestion[] = answers.map((ans, qi) => {
    const ansKey = normKey(ans.title);
    const same = shuffle(
      clean.filter((t) => t.group === ans.group && normKey(t.title) !== ansKey),
      rng,
    );
    const other = shuffle(
      clean.filter((t) => t.group !== ans.group && normKey(t.title) !== ansKey),
      rng,
    );
    const picked: PoolTrack[] = [];
    const keys = new Set([ansKey]);
    for (const t of [...same, ...other]) {
      if (picked.length >= 3) break;
      const k = normKey(t.title);
      if (keys.has(k)) continue;
      keys.add(k);
      picked.push(t);
    }
    const all = shuffle([ans, ...picked], rng);
    const choices: Choice[] = all.map((t) => ({ title: t.title, artist: t.artist }));
    return {
      id: `q${qi}-${Math.floor(rng() * 1e9).toString(36)}`,
      track: stripGroup(ans),
      choices,
      answer: all.indexOf(ans),
      startAt: Math.floor(rng() * (maxStart + 1)),
    };
  });

  return { questions, warnings };
}

function stripGroup(t: PoolTrack): Track {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { group, ...rest } = t;
  return rest;
}

/** Score for a correct answer: 500 base + up to 500 for speed + streak bonus. */
export function scoreFor(correct: boolean, ms: number, durationMs: number, streak: number): number {
  if (!correct) return 0;
  const t = Math.min(Math.max(ms / durationMs, 0), 1);
  const speed = Math.round(500 * (1 - t));
  const bonus = Math.min(Math.max(streak - 1, 0), 3) * 100;
  return 500 + speed + bonus;
}
