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

type YtHit = { id: string; title: string; channel: string; thumbnail?: string; count?: number };

const looksLikePlaylistLink = (s: string) => /list=|youtube\.com|youtu\.be/i.test(s) || /^(PL|OL|UU|FL)[\w-]{10,}$/.test(s.trim());

export function YouTubePicker({
  value,
  onPick,
}: {
  value?: Extract<SongSource, { kind: "youtube" }>;
  onPick: (p: { playlistId: string; name: string }) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<YtHit[] | null>(null);
  const [picked, setPicked] = useState<{ title: string; count?: number } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      if (looksLikePlaylistLink(t)) {
        // Pasted link: check it and select it straight away.
        const res = await fetch(`/api/youtube?url=${encodeURIComponent(t)}`);
        const d = (await res.json()) as { id?: string; title?: string; count?: number; error?: string };
        if (!res.ok || !d.id) throw new Error(d.error || "ใช้เพลย์ลิสต์นี้ไม่ได้");
        if ((d.count ?? 0) < 4) throw new Error("เพลย์ลิสต์นี้มีคลิปน้อยกว่า 4 คลิป");
        choose({ id: d.id, title: d.title ?? "เพลย์ลิสต์ YouTube", channel: "", count: d.count });
        setHits(null);
      } else {
        // Words: search public playlists.
        const res = await fetch(`/api/youtube?q=${encodeURIComponent(t)}`);
        const d = (await res.json()) as { playlists?: YtHit[]; error?: string };
        if (!res.ok) throw new Error(d.error || "ค้นหาไม่สำเร็จ");
        setHits(d.playlists ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "ใช้เพลย์ลิสต์นี้ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  function choose(h: YtHit) {
    setPicked({ title: h.title, count: h.count });
    onPick({ playlistId: h.id, name: h.title });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="flex gap-2">
        <label htmlFor="yt-q" className="sr-only">
          ค้นหาหรือวางลิงก์เพลย์ลิสต์ YouTube
        </label>
        <input
          id="yt-q"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ค้นหา เช่น เพลงฮิต 2010 หรือวางลิงก์เพลย์ลิสต์"
          className="min-w-0 flex-1 rounded-xl border-2 border-stage-2 bg-night px-4 py-3 placeholder:text-muted/60 focus:border-kho focus:outline-none"
        />
        <Button type="submit" tone="secondary" disabled={busy || !text.trim()} className="!py-3 !text-base">
          {busy ? "กำลังหา…" : looksLikePlaylistLink(text) ? "ใช้ลิงก์นี้" : "ค้นหา"}
        </Button>
      </form>
      {error && <Banner tone="error">{error}</Banner>}

      {hits && hits.length === 0 && <p className="text-muted">ไม่เจอเพลย์ลิสต์ ลองคำอื่น เช่น ชื่อศิลปิน ยุค หรือแนวเพลง</p>}
      {hits && hits.length > 0 && (
        <ul role="radiogroup" aria-label="ผลค้นหาเพลย์ลิสต์" className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {hits.map((h) => {
            const on = value?.playlistId === h.id;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => choose(h)}
                  className={`flex w-full items-center gap-3 rounded-xl border-2 p-2 text-left ${on ? "border-good bg-stage-2" : "border-stage-2 bg-night/40 hover:border-muted/50"}`}
                >
                  {h.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.thumbnail} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="h-12 w-20 shrink-0 rounded-lg bg-stage-2" />
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 font-medium leading-snug">{h.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {h.channel}
                      {h.count != null && ` · ${h.count} คลิป`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {value?.playlistId && (
        <p className="text-good">
          เลือกแล้ว: {picked?.title ?? value.name ?? "เพลย์ลิสต์ YouTube"}
          {picked?.count != null && <span className="text-muted"> · {picked.count} คลิป</span>}
        </p>
      )}
      <p className="text-sm text-muted">
        ระบบจะจับคู่คลิปกับเพลงบน Apple Music เพื่อเล่นตัวอย่าง คลิปที่ไม่ใช่เพลงหรือหาไม่เจอจะถูกข้าม เพลย์ลิสต์จาก YouTube Music จับคู่ได้แม่นที่สุด
        ใช้ Mix อัตโนมัติไม่ได้
      </p>
    </div>
  );
}
