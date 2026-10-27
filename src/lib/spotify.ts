"use client";
// Spotify login for the host (Authorization Code + PKCE, no server secret) and
// reading the host's own playlists in the browser.
//
// Spotify rules as of the February 2026 Web API changes:
//  - apps in Development Mode: the app owner needs Premium; up to 5 Spotify
//    accounts can log in (add them under "User Management" in the dashboard)
//  - playlist tracks come from GET /playlists/{id}/items, and only for playlists
//    the logged-in user owns or collaborates on; other playlists return metadata only

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = "playlist-read-private playlist-read-collaborative";
const TOKEN_KEY = "tsq:spotify:token";
const PKCE_KEY = "tsq:spotify:pkce";
const API = "https://api.spotify.com/v1";

export const spotifyEnabled = Boolean(CLIENT_ID);

type Token = { access_token: string; refresh_token?: string; expires_at: number };

export type SpotifyPlaylist = { id: string; name: string; count: number | null; image?: string; owner: string };

export function spotifyRedirectUri() {
  return `${location.origin}/spotify-callback`;
}

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(len = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

function readToken(): Token | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Token) : null;
  } catch {
    return null;
  }
}

function saveToken(t: { access_token: string; refresh_token?: string; expires_in: number }, prev?: Token | null) {
  const token: Token = {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? prev?.refresh_token,
    expires_at: Date.now() + (t.expires_in - 60) * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

export function isSpotifyConnected() {
  return !!readToken();
}

export function disconnectSpotify() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Opens the Spotify login in a popup so the host never leaves the room. Resolves true on success. */
export async function connectSpotify(): Promise<boolean> {
  const verifier = randomString(64);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  localStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const url =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: spotifyRedirectUri(),
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });
  const popup = window.open(url, "spotify-login", "width=480,height=720");
  if (!popup) {
    // Popup blocked: fall back to a full redirect; the callback page brings the host back.
    localStorage.setItem("tsq:spotify:return", location.pathname);
    location.href = url;
    return false;
  }
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.removeEventListener("message", onMsg);
      clearInterval(poll);
      resolve(ok);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data?.type === "tsq-spotify") done(!!e.data.ok);
    };
    window.addEventListener("message", onMsg);
    const poll = setInterval(() => {
      if (popup.closed) done(isSpotifyConnected());
    }, 500);
  });
}

/** Called by /spotify-callback. */
export async function finishSpotifyLogin(search: string): Promise<{ ok: boolean; error?: string }> {
  const params = new URLSearchParams(search);
  if (params.get("error")) return { ok: false, error: params.get("error") === "access_denied" ? "ยกเลิกการเชื่อม Spotify" : params.get("error")! };
  const code = params.get("code");
  let pkce: { verifier: string; state: string } | null = null;
  try {
    pkce = JSON.parse(localStorage.getItem(PKCE_KEY) ?? "null");
  } catch {}
  if (!code || !pkce || params.get("state") !== pkce.state) return { ok: false, error: "ลิงก์ล็อกอินไม่ถูกต้อง ลองกดเชื่อม Spotify ใหม่" };
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: spotifyRedirectUri(),
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier,
    }),
  });
  localStorage.removeItem(PKCE_KEY);
  if (!res.ok) return { ok: false, error: `Spotify ไม่ยอมให้ล็อกอิน (HTTP ${res.status})` };
  saveToken(await res.json());
  return { ok: true };
}

async function accessToken(): Promise<string> {
  const t = readToken();
  if (!t) throw new Error("ยังไม่ได้เชื่อม Spotify");
  if (Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error("การเชื่อม Spotify หมดอายุ กดเชื่อมใหม่อีกครั้ง");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    disconnectSpotify();
    throw new Error("การเชื่อม Spotify หมดอายุ กดเชื่อมใหม่อีกครั้ง");
  }
  return saveToken(await res.json(), t).access_token;
}

async function api<T>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API}${pathOrUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (res.status === 401) {
    disconnectSpotify();
    throw new Error("การเชื่อม Spotify หมดอายุ กดเชื่อมใหม่อีกครั้ง");
  }
  if (res.status === 403) throw new Error("บัญชี Spotify นี้ยังไม่ได้รับอนุญาตในแอป (เพิ่มใน User Management ของ Spotify Developer)");
  if (!res.ok) throw new Error(`Spotify ตอบกลับผิดพลาด (HTTP ${res.status})`);
  return (await res.json()) as T;
}

type Page<T> = { items: T[]; next: string | null };
type RawPlaylist = {
  id: string;
  name: string;
  collaborative?: boolean;
  owner?: { id?: string; display_name?: string };
  images?: { url: string }[] | null;
  items?: { total?: number };
  tracks?: { total?: number };
};

/** Playlists the host owns or collaborates on: the only ones Spotify lets a dev-mode app read. */
export async function listMyPlaylists(): Promise<SpotifyPlaylist[]> {
  const me = await api<{ id: string }>("/me");
  const out: SpotifyPlaylist[] = [];
  let url: string | null = "/me/playlists?limit=50";
  while (url && out.length < 200) {
    const page: Page<RawPlaylist | null> = await api<Page<RawPlaylist | null>>(url);
    for (const p of page.items) {
      if (!p || (p.owner?.id !== me.id && !p.collaborative)) continue;
      out.push({
        id: p.id,
        name: p.name,
        count: p.items?.total ?? p.tracks?.total ?? null,
        image: p.images?.[p.images.length - 1]?.url ?? p.images?.[0]?.url,
        owner: p.owner?.display_name ?? "",
      });
    }
    url = page.next;
  }
  return out;
}

type RawEntry = {
  item?: RawTrack | null;
  track?: RawTrack | null;
  is_local?: boolean;
};
type RawTrack = { type?: string; name?: string; is_local?: boolean; artists?: { name?: string }[] };

/** Title + artist of every song in one of the host's playlists (up to 500). */
export async function getPlaylistTracks(playlistId: string): Promise<{ title: string; artist: string }[]> {
  const out: { title: string; artist: string }[] = [];
  let url: string | null = `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
  while (url && out.length < 500) {
    const page: Page<RawEntry> = await api<Page<RawEntry>>(url);
    for (const e of page.items ?? []) {
      const t = e.item ?? e.track;
      if (!t || e.is_local || t.is_local || (t.type && t.type !== "track")) continue;
      const artist = t.artists?.[0]?.name;
      if (t.name && artist) out.push({ title: t.name, artist });
    }
    url = page.next;
  }
  if (!out.length) throw new Error("อ่านเพลงในเพลย์ลิสต์นี้ไม่ได้ Spotify ให้อ่านได้เฉพาะเพลย์ลิสต์ที่คุณเป็นเจ้าของหรือร่วมแก้ไข");
  return out;
}
