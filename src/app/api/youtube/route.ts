import type { NextRequest } from "next/server";
import { fetchYouTubePlaylist, parseYouTubePlaylistId, searchYouTubePlaylists } from "@/lib/youtube";

// ?url=<link>  check a pasted playlist link: name and song count
// ?q=<words>   search public playlists
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q) {
    try {
      return Response.json({ playlists: await searchYouTubePlaylists(q) });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "ค้นหาไม่สำเร็จ" }, { status: 502 });
    }
  }
  const id = parseYouTubePlaylistId(req.nextUrl.searchParams.get("url") ?? "");
  if (!id) return Response.json({ error: "ลิงก์นี้ไม่ใช่เพลย์ลิสต์ YouTube (ต้องมี list=… ในลิงก์)" }, { status: 400 });
  try {
    const { title, items } = await fetchYouTubePlaylist(id, 200);
    return Response.json({ id, title: title ?? "เพลย์ลิสต์ YouTube", count: items.length });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "ดึงเพลย์ลิสต์ไม่สำเร็จ" }, { status: 502 });
  }
}
