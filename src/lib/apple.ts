// Server-only: fetch songs from Apple's public, keyless APIs.
//  - Apple Music RSS: Thailand's most-played songs chart (ids only)
//  - iTunes Lookup/Search API: track details incl. 30-second previewUrl
// Thai storefront ("th") so titles come back the way Thai listeners know them.

import "server-only";
import { cleanTitle, isAltVersion, type PoolTrack } from "./music.ts";

const COUNTRY = "th";
const TIMEOUT_MS = 9000;

type ItunesTrack = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackViewUrl?: string;
};

type ItunesArtist = {
  wrapperType?: string;
  artistType?: string;
  artistId?: number;
  artistName?: string;
  primaryGenreName?: string;
};

// Small in-memory cache so a busy lobby doesn't hammer Apple (iTunes Search is rate limited).
const memo = new Map<string, { at: number; data: unknown }>();
const MEMO_MS = 60 * 60 * 1000;

async function getJson<T>(url: string, ttlMs = MEMO_MS): Promise<T> {
  const hit = memo.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} จาก ${new URL(url).host}`);
    const data = (await res.json()) as T;
    memo.set(url, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function bigArtwork(url?: string) {
  return url?.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

export function toPoolTrack(t: ItunesTrack, group: string): PoolTrack | null {
  if (t.kind !== "song" || !t.previewUrl || !t.trackName || !t.artistName || !t.trackId) return null;
  if (isAltVersion(t.trackName, t.collectionName)) return null;
  return {
    id: String(t.trackId),
    title: cleanTitle(t.trackName),
    rawTitle: t.trackName,
    artist: t.artistName,
    album: t.collectionName,
    artwork: bigArtwork(t.artworkUrl100),
    previewUrl: t.previewUrl,
    storeUrl: t.trackViewUrl,
    group,
  };
}

// The RSS generator has lived on two hostnames; try the current one first.
const RSS_HOSTS = ["https://rss.marketingtools.apple.com", "https://rss.applemarketingtools.com"];

export async function getThaiChart(size: 50 | 100): Promise<PoolTrack[]> {
  let ids: string[] = [];
  let lastErr: unknown;
  for (const host of RSS_HOSTS) {
    try {
      const data = await getJson<{ feed?: { results?: { id: string }[] } }>(
        `${host}/api/v2/${COUNTRY}/music/most-played/${size}/songs.json`,
      );
      ids = (data.feed?.results ?? []).map((r) => r.id).filter(Boolean);
      if (ids.length) break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!ids.length) {
    throw new Error(`ดึงชาร์ตเพลงไทยจาก Apple ไม่สำเร็จ${lastErr ? ` (${String(lastErr)})` : ""}`);
  }

  // Lookup in chunks; keep chart order.
  const byId = new Map<string, PoolTrack>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).join(",");
    const data = await getJson<{ results?: ItunesTrack[] }>(
      `https://itunes.apple.com/lookup?id=${chunk}&country=${COUNTRY}`,
    );
    for (const r of data.results ?? []) {
      const t = toPoolTrack(r, "chart");
      if (t) byId.set(t.id, t);
    }
  }
  return ids.map((id) => byId.get(id)).filter((t): t is PoolTrack => !!t);
}

export async function searchArtistSongs(artist: string): Promise<PoolTrack[]> {
  const term = encodeURIComponent(artist.trim());
  const base = `https://itunes.apple.com/search?term=${term}&country=${COUNTRY}&media=music&entity=song&limit=100`;
  let data = await getJson<{ results?: ItunesTrack[] }>(`${base}&attribute=artistTerm`);
  let tracks = (data.results ?? []).map((r) => toPoolTrack(r, artist)).filter((t): t is PoolTrack => !!t);
  if (tracks.length < 4) {
    // Some Thai names only match on the general term.
    data = await getJson<{ results?: ItunesTrack[] }>(base);
    tracks = (data.results ?? []).map((r) => toPoolTrack(r, artist)).filter((t): t is PoolTrack => !!t);
  }
  return tracks;
}

export async function suggestArtists(q: string): Promise<{ id: number; name: string; genre?: string }[]> {
  const term = encodeURIComponent(q.trim());
  const data = await getJson<{ results?: ItunesArtist[] }>(
    `https://itunes.apple.com/search?term=${term}&country=${COUNTRY}&media=music&entity=musicArtist&limit=8`,
    24 * MEMO_MS,
  );
  const seen = new Set<string>();
  return (data.results ?? [])
    .filter((a) => a.artistName && a.artistId)
    .filter((a) => (seen.has(a.artistName!) ? false : (seen.add(a.artistName!), true)))
    .map((a) => ({ id: a.artistId!, name: a.artistName!, genre: a.primaryGenreName }));
}
