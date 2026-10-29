import { getThaiChart, lookupTracks, mapLimit, searchArtistDecoys, searchArtistSongs, searchSongs } from "@/lib/apple";
import { buildQuestions, pickAnswers, type PoolTrack, type WantedTrack } from "@/lib/music";
import { sealDeck } from "@/lib/deck";
import { mockPool } from "@/lib/mock";
import { resolveTrackList, resolveYouTube } from "@/lib/playlist";
import { presetById } from "@/lib/presets";
import type { SongSource } from "@/lib/types";
import { fetchYouTubePlaylist } from "@/lib/youtube";

const MAX_ARTISTS = 8;
const MAX_DECOY_SEARCHES = 12;
const MAX_TRACKS = 500;

type Body = {
  source?: SongSource;
  rounds?: number;
  roundSeconds?: number;
  listenSeconds?: number;
  /** Spotify playlists are read in the host's browser (with their login) and sent here. */
  tracks?: WantedTrack[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const rounds = clampInt(body.rounds, 3, 30, 10);
  const roundSeconds = clampInt(body.roundSeconds, 5, 25, 15);
  const listenSeconds = clampInt(body.listenSeconds, 0, 5, 3);
  const source = body.source;
  const warnings: string[] = [];
  let pool: PoolTrack[] = [];
  let answers: PoolTrack[] | undefined;

  try {
    if (process.env.MOCK_MUSIC === "1") {
      pool = mockPool();
    } else if (source?.kind === "chart" || source?.kind === "custom") {
      if (source.kind === "chart") {
        pool = await getThaiChart(source.size === 50 ? 50 : 100);
      } else {
        const ids = Array.isArray(source.trackIds) ? source.trackIds.map(String) : [];
        pool = await lookupTracks(ids);
        const missing = ids.length - pool.length;
        if (missing > 0) warnings.push(`มี ${missing} เพลงในเพลย์ลิสต์ที่ไม่มีตัวอย่างแล้ว เลยข้ามไป`);
        if (pool.length < 4) return Response.json({ error: "เพลย์ลิสต์ต้องมีเพลงที่เล่นได้อย่างน้อย 4 เพลง" }, { status: 422 });
      }
      // Songs from a chart or playlist are mostly by different artists, which makes the
      // choices too easy (recognise the voice, pick the one by that singer). Pull in other
      // songs by each answer's artist to use as wrong choices.
      answers = pickAnswers(pool, rounds);
      const artists = [...new Set(answers.map((a) => mainArtist(a.artist)))].slice(0, MAX_DECOY_SEARCHES);
      const decoys = await mapLimit(artists, 3, searchArtistDecoys);
      pool = [...pool, ...decoys.flat()];
    } else if (source?.kind === "artists" || source?.kind === "preset") {
      const list = source.kind === "preset" ? (presetById(source.id)?.artists ?? []) : (source.artists ?? []);
      const artists = [...new Set(list.map((a) => String(a).trim().slice(0, 60)).filter(Boolean))].slice(0, MAX_ARTISTS);
      if (!artists.length) {
        return Response.json({ error: source.kind === "preset" ? "ไม่พบชุดเพลงนี้" : "ยังไม่ได้เลือกศิลปิน" }, { status: 400 });
      }
      const results = await Promise.allSettled(artists.map((a) => searchArtistSongs(a)));
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (r.value.length === 0) warnings.push(`ไม่พบเพลงที่มีตัวอย่างของ "${artists[i]}"`);
          pool.push(...r.value);
        } else {
          warnings.push(`ค้นหา "${artists[i]}" ไม่สำเร็จ`);
        }
      });
    } else if (source?.kind === "spotify") {
      const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
      if (!tracks.length) return Response.json({ error: "ไม่ได้รับรายการเพลงจาก Spotify" }, { status: 400 });
      const r = await resolveTrackList(tracks, rounds, (t) => searchSongs(t));
      pool = r.pool;
      answers = r.answers;
      warnings.push(...r.warnings);
    } else if (source?.kind === "youtube") {
      const { items } = await fetchYouTubePlaylist(source.playlistId);
      if (!items.length) return Response.json({ error: "เพลย์ลิสต์ YouTube นี้ว่างหรือดึงรายการไม่ได้" }, { status: 422 });
      const r = await resolveYouTube(items, rounds, (t) => searchSongs(t));
      pool = r.pool;
      answers = r.answers;
      warnings.push(...r.warnings);
    } else {
      return Response.json({ error: "ไม่รู้จักแหล่งเพลงนี้" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "ดึงเพลงไม่สำเร็จ" }, { status: 502 });
  }

  if (answers && !answers.length) {
    return Response.json({ error: warnings.join(" · ") || "หาเพลงที่มีตัวอย่างไม่เจอ" }, { status: 422 });
  }
  const built = buildQuestions(pool, rounds, listenSeconds + roundSeconds, Math.random, answers);
  warnings.push(...built.warnings);
  if (!built.questions.length) {
    return Response.json({ error: warnings.join(" · ") || "สร้างคำถามไม่สำเร็จ" }, { status: 422 });
  }
  const { deck, deckId } = sealDeck(built.questions);
  return Response.json({ questions: built.questions, warnings, poolSize: pool.length, deck, deckId });
}

function mainArtist(artist: string) {
  return artist.split(/\s*(?:,|&|\+|\s(?:x|X|ft\.?|feat\.?|และ)\s)\s*/)[0] || artist;
}

function clampInt(v: unknown, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
