// Turn a playlist from another service into quiz material.
// Previews always come from Apple Music; the playlist only says which songs.
// iTunes Search is rate limited (~20 calls/min), so only as many songs as the
// game needs are looked up, a few at a time.

import { cleanTitle, normKey, parseYouTubeItem, pickMatch, primaryArtistKey, shuffle, type PoolTrack, type WantedTrack } from "./music.ts";

type Search = (term: string) => Promise<PoolTrack[]>;

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch {
          out[k] = null;
        }
      }
    }),
  );
  return out;
}

export type Resolved = { pool: PoolTrack[]; answers: PoolTrack[]; warnings: string[] };

/**
 * Spotify-style list with clean titles and artists.
 * Answers: matched on Apple Music (for the preview), shown with the playlist's own titles.
 * Wrong choices: the rest of the playlist, titles only (no lookup needed).
 */
export async function resolveTrackList(list: WantedTrack[], rounds: number, search: Search, rng = Math.random): Promise<Resolved> {
  const seen = new Set<string>();
  const wanted = shuffle(
    list
      .map((t) => ({ title: cleanTitle(String(t.title ?? "")).slice(0, 100), artist: String(t.artist ?? "").slice(0, 100) }))
      .filter((t) => t.title && t.artist)
      .filter((t) => {
        const k = normKey(t.title) + "|" + primaryArtistKey(t.artist);
        return seen.has(k) ? false : (seen.add(k), true);
      }),
    rng,
  );
  const warnings: string[] = [];
  if (wanted.length < 4) return { pool: [], answers: [], warnings: ["เพลย์ลิสต์นี้มีเพลงน้อยเกินไป (ต้องมีอย่างน้อย 4 เพลง)"] };

  const answers: PoolTrack[] = [];
  const used = new Set<number>();
  // Look up in small batches until there are enough answers or the budget runs out.
  const budget = Math.min(wanted.length, rounds * 2 + 4);
  let next = 0;
  while (answers.length < rounds && next < budget) {
    const batch = wanted.slice(next, Math.min(budget, next + Math.max(3, rounds - answers.length + 2))).map((w, j) => ({ w, idx: next + j }));
    next += batch.length;
    const found = await mapLimit(batch, 3, async ({ w }) => pickMatch(await search(`${w.title} ${w.artist}`), { query: `${w.title} ${w.artist}`, title: w.title, artist: w.artist }));
    found.forEach((m, j) => {
      if (!m || answers.length >= rounds) return;
      const { w, idx } = batch[j];
      used.add(idx);
      answers.push({ ...m, title: w.title, artist: w.artist, group: "playlist" });
    });
  }
  const missed = next - used.size;
  if (missed > 0) warnings.push(`หาตัวอย่างเพลงบน Apple Music ไม่เจอ ${missed} เพลง เลยข้ามไป`);

  const decoys: PoolTrack[] = wanted
    .filter((_, i) => !used.has(i))
    .map((w, i) => ({ id: `d${i}`, title: w.title, rawTitle: w.title, artist: w.artist, previewUrl: "", group: "playlist", answerable: false }));

  return { pool: [...answers, ...decoys], answers, warnings };
}

/**
 * YouTube titles are messy ("เพลง - ศิลปิน [Official MV]"), so every song used in the
 * game, answers and wrong choices alike, is matched on Apple Music and shown with
 * Apple's clean title.
 */
export async function resolveYouTube(
  items: { videoTitle: string; channel: string }[],
  rounds: number,
  search: Search,
  rng = Math.random,
): Promise<Resolved> {
  const candidates = shuffle(items, rng).map((it) => parseYouTubeItem(it.videoTitle, it.channel));
  const budget = Math.min(candidates.length, rounds + 8);
  const found = await mapLimit(candidates.slice(0, budget), 3, async (c) => pickMatch(await search(c.query), c));
  const seen = new Set<string>();
  const pool = found
    .filter((m): m is PoolTrack => !!m)
    .filter((m) => (seen.has(normKey(m.title)) ? false : (seen.add(normKey(m.title)), true)))
    .map((m) => ({ ...m, group: "playlist" }));
  const warnings: string[] = [];
  const missed = budget - pool.length;
  if (missed > 0) warnings.push(`จับคู่คลิป YouTube กับเพลงบน Apple Music ไม่ได้ ${missed} คลิป เลยข้ามไป`);
  if (pool.length < 4) {
    return { pool: [], answers: [], warnings: [...warnings, "จับคู่เพลงจากเพลย์ลิสต์นี้ได้ไม่ถึง 4 เพลง ลองเพลย์ลิสต์ที่เป็นคลิปเพลงทางการ หรือเพลงจาก YouTube Music"] };
  }
  // Leave a few matched songs as wrong choices rather than answers.
  const answers = pool.slice(0, Math.max(1, Math.min(rounds, pool.length - 3)));
  return { pool, answers, warnings };
}
