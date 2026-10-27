"use client";
// Playlists the host builds in the app. Stored in this browser only.

export type SavedSong = { id: string; title: string; artist: string; artwork?: string };
export type MyPlaylist = { id: string; name: string; songs: SavedSong[]; updatedAt: number };

const KEY = "tsq:playlists";

export function loadPlaylists(): MyPlaylist[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as MyPlaylist[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function savePlaylists(list: MyPlaylist[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}

export function newPlaylist(name = "เพลย์ลิสต์ของฉัน"): MyPlaylist {
  return { id: crypto.randomUUID(), name, songs: [], updatedAt: Date.now() };
}
