import type { NextRequest } from "next/server";
import { searchSongs } from "@/lib/apple";

// Song search for building your own playlist (Apple Music Thailand, free iTunes API).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ songs: [] });
  try {
    const songs = (await searchSongs(q, 20)).map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      artwork: t.artwork?.replace("600x600bb", "100x100bb"),
      previewUrl: t.previewUrl,
    }));
    return Response.json({ songs });
  } catch {
    return Response.json({ error: "ค้นหาเพลงไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 502 });
  }
}
