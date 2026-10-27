"use client";

import { useEffect, useState } from "react";
import { PRESETS } from "@/lib/presets";
import {
  connectSpotify,
  disconnectSpotify,
  isSpotifyConnected,
  listMyPlaylists,
  spotifyEnabled,
  spotifyRedirectUri,
  type SpotifyPlaylist,
} from "@/lib/spotify";
import type { SongSource } from "@/lib/types";
import { Banner, Button } from "./ui";

export function PresetPicker({ value, onPick }: { value?: string; onPick: (id: string) => void }) {
  return (
    <div role="radiogroup" aria-label="ชุดเพลง" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {PRESETS.map((p) => {
        const on = p.id === value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(p.id)}
            className={`rounded-xl border-2 px-3.5 py-3 text-left ${on ? "border-kho-khwai bg-stage-2" : "border-stage-2 bg-night/40 hover:border-muted/50"}`}
          >
            <span className="block font-display text-lg">{p.name}</span>
            <span className="block truncate text-sm text-muted">{p.detail}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SpotifyPicker({
  value,
  onPick,
}: {
  value?: Extract<SongSource, { kind: "spotify" }>;
  onPick: (p: SpotifyPlaylist) => void;
}) {
  const [connected, setConnected] = useState(isSpotifyConnected);
  const [lists, setLists] = useState<SpotifyPlaylist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    listMyPlaylists()
      .then((l) => alive && setLists(l))
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "โหลดเพลย์ลิสต์ไม่สำเร็จ");
        if (!isSpotifyConnected()) setConnected(false);
      });
    return () => {
      alive = false;
    };
  }, [connected]);

  if (!spotifyEnabled) {
    return (
      <Banner tone="warn">
        ยังไม่ได้ตั้งค่า Spotify บนเว็บนี้: ต้องใส่ <code>NEXT_PUBLIC_SPOTIFY_CLIENT_ID</code> ใน Environment Variables (ดูวิธีใน README)
      </Banner>
    );
  }

  if (!connected) {
    return (
      <div className="space-y-3">
        <p className="text-muted">เชื่อมบัญชี Spotify ของหัวห้อง แล้วเลือกเพลย์ลิสต์ของคุณ เพื่อนไม่ต้องล็อกอิน</p>
        <Button
          type="button"
          tone="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const ok = await connectSpotify();
            setBusy(false);
            if (ok) setConnected(true);
          }}
        >
          {busy ? "รอล็อกอินในหน้าต่าง Spotify…" : "เชื่อม Spotify"}
        </Button>
        {error && <Banner tone="error">{error}</Banner>}
        <p className="text-sm text-muted">ถ้าล็อกอินแล้วขึ้น INVALID_CLIENT ให้เพิ่ม Redirect URI นี้ในแอป Spotify: {spotifyRedirectUri()}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Banner tone="error">{error}</Banner>}
      {!lists && !error && <p className="text-muted">กำลังโหลดเพลย์ลิสต์ของคุณ…</p>}
      {lists && lists.length === 0 && <p className="text-muted">ยังไม่มีเพลย์ลิสต์ที่คุณเป็นเจ้าของ</p>}
      {lists && lists.length > 0 && (
        <ul role="radiogroup" aria-label="เพลย์ลิสต์ Spotify" className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {lists.map((p) => {
            const on = value?.playlistId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(p)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-2 text-left ${on ? "border-good bg-stage-2" : "border-stage-2 bg-night/40 hover:border-muted/50"}`}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="size-12 shrink-0 rounded-lg bg-stage-2" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    {p.count != null && <span className="text-sm text-muted">{p.count} เพลง</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-sm text-muted">
        Spotify ให้ใช้ได้เฉพาะเพลย์ลิสต์ที่คุณเป็นเจ้าของหรือร่วมแก้ไข ถ้าอยากใช้เพลย์ลิสต์ของคนอื่น ให้เพิ่มเพลงทั้งหมดเข้าเพลย์ลิสต์ใหม่ของคุณก่อน
      </p>
      <button
        type="button"
        className="text-sm text-muted underline underline-offset-4 hover:text-ink"
        onClick={() => {
          disconnectSpotify();
          setLists(null);
          setConnected(false);
        }}
      >
        ออกจากระบบ Spotify
      </button>
    </div>
  );
}

export function YouTubePicker({
  value,
  onPick,
}: {
  value?: Extract<SongSource, { kind: "youtube" }>;
  onPick: (p: { playlistId: string; name: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ title: string; count: number } | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/youtube?url=${encodeURIComponent(url.trim())}`);
      const d = (await res.json()) as { id?: string; title?: string; count?: number; error?: string };
      if (!res.ok || !d.id) throw new Error(d.error || "ใช้เพลย์ลิสต์นี้ไม่ได้");
      if ((d.count ?? 0) < 4) throw new Error("เพลย์ลิสต์นี้มีคลิปน้อยกว่า 4 คลิป");
      setInfo({ title: d.title ?? "เพลย์ลิสต์ YouTube", count: d.count ?? 0 });
      onPick({ playlistId: d.id, name: d.title ?? "เพลย์ลิสต์ YouTube" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "ใช้เพลย์ลิสต์นี้ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={check} className="flex gap-2">
        <label htmlFor="yt-url" className="sr-only">
          ลิงก์เพลย์ลิสต์ YouTube
        </label>
        <input
          id="yt-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="วางลิงก์เพลย์ลิสต์ youtube.com/playlist?list=…"
          className="min-w-0 flex-1 rounded-xl border-2 border-stage-2 bg-night px-4 py-3 placeholder:text-muted/60 focus:border-kho focus:outline-none"
        />
        <Button type="submit" tone="secondary" disabled={busy || !url.trim()} className="!py-3 !text-base">
          {busy ? "กำลังตรวจ…" : "ใช้เพลย์ลิสต์นี้"}
        </Button>
      </form>
      {error && <Banner tone="error">{error}</Banner>}
      {value && (
        <p className="text-good">
          เลือกแล้ว: {info?.title ?? value.name ?? "เพลย์ลิสต์ YouTube"}
          {info && <span className="text-muted"> · {info.count} คลิป</span>}
        </p>
      )}
      <p className="text-sm text-muted">
        เพลย์ลิสต์ต้องเป็นสาธารณะหรือ Unlisted ใช้ Mix อัตโนมัติไม่ได้ ระบบจะจับคู่คลิปกับเพลงบน Apple Music เพื่อเล่นตัวอย่าง คลิปที่หาไม่เจอจะถูกข้าม
        เพลย์ลิสต์จาก YouTube Music จับคู่ได้แม่นที่สุด
      </p>
    </div>
  );
}
