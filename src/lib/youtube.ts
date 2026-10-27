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

export type YouTubePlaylistHit = { id: string; title: string; channel: string; thumbnail?: string; count?: number };

/**
 * Search public playlists. search.list costs 100 quota units (of 10,000/day free),
 * playlists.list for the song counts costs 1 more.
 */
export async function searchYouTubePlaylists(q: string): Promise<YouTubePlaylistHit[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า YOUTUBE_API_KEY บนเซิร์ฟเวอร์ (ดูวิธีใน README)");
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=playlist&maxResults=12` +
    `&regionCode=TH&relevanceLanguage=th&q=${encodeURIComponent(q)}&key=${key}`;
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 403) throw new Error("โควตาค้นหา YouTube วันนี้หมดแล้ว หรือ API key ยังไม่ได้เปิด YouTube Data API v3");
  if (!res.ok) throw new Error(`ค้นหาเพลย์ลิสต์ YouTube ไม่สำเร็จ (HTTP ${res.status})`);
  const data = (await res.json()) as {
    items?: { id?: { playlistId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } } }[];
  };
  const hits: YouTubePlaylistHit[] = (data.items ?? [])
    .filter((it) => it.id?.playlistId && it.snippet?.title)
    .map((it) => ({
      id: it.id!.playlistId!,
      title: it.snippet!.title!,
      channel: it.snippet?.channelTitle ?? "",
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url,
    }));
  if (hits.length) {
    try {
      const meta = await fetch(
        `https://www.googleapis.com/youtube/v3/playlists?part=contentDetails&maxResults=50&id=${hits.map((h) => h.id).join(",")}&key=${key}`,
        { cache: "no-store" },
      );
      if (meta.ok) {
        const m = (await meta.json()) as { items?: { id: string; contentDetails?: { itemCount?: number } }[] };
        const counts = new Map((m.items ?? []).map((i) => [i.id, i.contentDetails?.itemCount]));
        for (const h of hits) h.count = counts.get(h.id);
      }
    } catch {}
  }
  return hits.filter((h) => h.count == null || h.count >= 4);
}
