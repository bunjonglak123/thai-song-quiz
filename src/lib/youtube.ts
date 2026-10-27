// Server-only: read a public YouTube playlist with the YouTube Data API v3.
// Needs YOUTUBE_API_KEY (free, from Google Cloud Console → YouTube Data API v3).

import "server-only";

export type YouTubeItem = { videoTitle: string; channel: string };

/** Accepts a full link (…?list=PL…) or a bare playlist id. */
export function parseYouTubePlaylistId(input: string): string | null {
  const s = input.trim();
  try {
    const u = new URL(s);
    const list = u.searchParams.get("list");
    if (list && /^[\w-]{10,}$/.test(list)) return list;
  } catch {}
  return /^[\w-]{10,}$/.test(s) ? s : null;
}

export async function fetchYouTubePlaylist(playlistId: string, max = 200): Promise<{ title?: string; items: YouTubeItem[] }> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY บนเซิร์ฟเวอร์ (ดูวิธีใน README)");
  if (playlistId.startsWith("RD")) throw new Error("เพลย์ลิสต์แบบ Mix ของ YouTube ดึงรายการเพลงไม่ได้ ใช้เพลย์ลิสต์ที่สร้างเองหรือเพลย์ลิสต์สาธารณะแทน");

  const items: YouTubeItem[] = [];
  let pageToken = "";
  while (items.length < max) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50` +
      `&playlistId=${encodeURIComponent(playlistId)}&key=${key}` +
      (pageToken ? `&pageToken=${pageToken}` : "");
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404) throw new Error("ไม่พบเพลย์ลิสต์นี้ ตรวจว่าตั้งเป็นสาธารณะหรือไม่เป็นส่วนตัว (Unlisted ก็ใช้ได้)");
    if (!res.ok) throw new Error(`ดึงเพลย์ลิสต์ YouTube ไม่สำเร็จ (HTTP ${res.status})`);
    const data = (await res.json()) as {
      nextPageToken?: string;
      items?: { snippet?: { title?: string; videoOwnerChannelTitle?: string } }[];
    };
    for (const it of data.items ?? []) {
      const t = it.snippet?.title;
      if (!t || t === "Private video" || t === "Deleted video") continue;
      items.push({ videoTitle: t, channel: it.snippet?.videoOwnerChannelTitle ?? "" });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  let title: string | undefined;
  try {
    const meta = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(playlistId)}&key=${key}`,
      { cache: "no-store" },
    );
    if (meta.ok) title = ((await meta.json()) as { items?: { snippet?: { title?: string } }[] }).items?.[0]?.snippet?.title;
  } catch {}
  return { title, items };
}
