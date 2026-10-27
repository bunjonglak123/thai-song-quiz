import { getThaiChart, searchArtistSongs } from "@/lib/apple";
import { buildQuestions, type PoolTrack } from "@/lib/music";
import { mockPool } from "@/lib/mock";
import type { SongSource } from "@/lib/types";

const MAX_ARTISTS = 8;

export async function POST(req: Request) {
  let body: { source?: SongSource; rounds?: number; roundSeconds?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  }

  const rounds = clampInt(body.rounds, 3, 30, 10);
  const roundSeconds = clampInt(body.roundSeconds, 5, 25, 15);
  const source = body.source;
  const warnings: string[] = [];
  let pool: PoolTrack[] = [];

  try {
    if (process.env.MOCK_MUSIC === "1") {
      pool = mockPool();
    } else if (source?.kind === "chart") {
      pool = await getThaiChart(source.size === 50 ? 50 : 100);
    } else if (source?.kind === "artists") {
      const artists = [...new Set((source.artists ?? []).map((a) => String(a).trim().slice(0, 60)).filter(Boolean))].slice(
        0,
        MAX_ARTISTS,
      );
      if (!artists.length) return Response.json({ error: "ยังไม่ได้เลือกศิลปิน" }, { status: 400 });
      const results = await Promise.allSettled(artists.map((a) => searchArtistSongs(a)));
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          if (r.value.length === 0) warnings.push(`ไม่พบเพลงที่มีตัวอย่างของ "${artists[i]}"`);
          pool.push(...r.value);
        } else {
          warnings.push(`ค้นหา "${artists[i]}" ไม่สำเร็จ`);
        }
      });
    } else {
      return Response.json({ error: "ไม่รู้จักแหล่งเพลงนี้" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "ดึงเพลงไม่สำเร็จ" }, { status: 502 });
  }

  const built = buildQuestions(pool, rounds, roundSeconds);
  warnings.push(...built.warnings);
  if (!built.questions.length) {
    return Response.json({ error: warnings.join(" · ") || "สร้างคำถามไม่สำเร็จ" }, { status: 422 });
  }
  return Response.json({ questions: built.questions, warnings, poolSize: pool.length });
}

function clampInt(v: unknown, min: number, max: number, dflt: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
