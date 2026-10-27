import type { NextRequest } from "next/server";
import { fetchYouTubePlaylist, parseYouTubePlaylistId } from "@/lib/youtube";

// Check a pasted YouTube playlist link before the game starts: name and song count.
export async function GET(req: NextRequest) {
  const id = parseYouTubePlaylistId(req.nextUrl.searchParams.get("url") ?? "");
  if (!id) return Response.json({ error: "ลิงก์นี้ไม่ใช่เพลย์ลิสต์ YouTube (ต้องมี list=… ในลิงก์)" }, { status: 400 });
  try {
    const { title, items } = await fetchYouTubePlaylist(id, 200);
    return Response.json({ id, title: title ?? "เพลย์ลิสต์ YouTube", count: items.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "ดึงเพลย์ลิสต์ไม่สำเร็จ" }, { status: 502 });
  }
}
