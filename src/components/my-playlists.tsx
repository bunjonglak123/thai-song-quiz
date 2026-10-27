"use client";

import { useEffect, useRef, useState } from "react";
import { loadPlaylists, newPlaylist, savePlaylists, type MyPlaylist, type SavedSong } from "@/lib/my-playlists";
import { Banner, Button } from "./ui";

type Hit = SavedSong & { previewUrl?: string };

/**
 * Host's own playlists: pick one to play, or build one by searching Apple Music.
 * Saved in this browser, so they're there next time the host opens a room here.
 */
export function MyPlaylistPicker({
  selectedId,
  onPick,
  minSongs,
}: {
  selectedId?: string;
  onPick: (p: MyPlaylist | null) => void;
  minSongs: number;
}) {
  const [lists, setLists] = useState<MyPlaylist[]>(loadPlaylists);
  const [editing, setEditing] = useState<MyPlaylist | null>(null);

  function persist(next: MyPlaylist[]) {
    setLists(next);
    savePlaylists(next);
  }

  function saveEdit(p: MyPlaylist) {
    const updated = { ...p, updatedAt: Date.now() };
    const next = [updated, ...lists.filter((l) => l.id !== p.id)];
    persist(next);
    setEditing(null);
    onPick(updated.songs.length >= 4 ? updated : null);
  }

  if (editing) {
    return <PlaylistEditor initial={editing} minSongs={minSongs} onDone={saveEdit} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-3">
      {lists.length === 0 ? (
        <p className="text-muted">ยังไม่มีเพลย์ลิสต์ สร้างเองได้โดยค้นหาเพลงจาก Apple Music แล้วกดเพิ่ม เพลงทุกเพลงเล่นตัวอย่างได้แน่นอน</p>
      ) : (
        <ul role="radiogroup" aria-label="เพลย์ลิสต์ของฉัน" className="grid gap-2 sm:grid-cols-2">
          {lists.map((p) => {
            const on = p.id === selectedId;
            const playable = p.songs.length >= 4;
            return (
              <li key={p.id} className={`flex items-center gap-2 rounded-xl border-2 p-2 ${on ? "border-good bg-stage-2" : "border-stage-2 bg-night/40"}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!playable}
                  onClick={() => onPick(p)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-50"
                >
                  <Covers songs={p.songs} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="text-sm text-muted">{playable ? `${p.songs.length} เพลง` : `${p.songs.length} เพลง · ต้องมีอย่างน้อย 4`}</span>
                  </span>
                </button>
                <button type="button" onClick={() => setEditing(p)} className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-stage-2 hover:text-ink">
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`ลบเพลย์ลิสต์ "${p.name}"?`)) return;
                    persist(lists.filter((l) => l.id !== p.id));
                    if (on) onPick(null);
                  }}
                  className="rounded-lg px-2 py-1 text-sm text-muted hover:bg-stage-2 hover:text-bad"
                  aria-label={`ลบ ${p.name}`}
                >
                  ลบ
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button type="button" tone="secondary" onClick={() => setEditing(newPlaylist(`เพลย์ลิสต์ ${lists.length + 1}`))} className="!py-2.5 !text-base">
        + สร้างเพลย์ลิสต์ใหม่
      </Button>
      <p className="text-sm text-muted">เพลย์ลิสต์เก็บไว้ในเบราว์เซอร์เครื่องนี้ เปิดห้องจากเครื่องนี้ครั้งหน้าก็ยังอยู่</p>
    </div>
  );
}

function Covers({ songs }: { songs: SavedSong[] }) {
  const arts = songs.filter((s) => s.artwork).slice(0, 4);
  if (!arts.length) return <span className="size-12 shrink-0 rounded-lg bg-stage-2" />;
  return (
    <span className="grid size-12 shrink-0 grid-cols-2 overflow-hidden rounded-lg bg-stage-2">
      {arts.map((s) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={s.id} src={s.artwork} alt="" className={`${arts.length === 1 ? "col-span-2 row-span-2 size-12" : "size-6"} object-cover`} />
      ))}
    </span>
  );
}

function PlaylistEditor({
  initial,
  minSongs,
  onDone,
  onCancel,
}: {
  initial: MyPlaylist;
  minSongs: number;
  onDone: (p: MyPlaylist) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [songs, setSongs] = useState<SavedSong[]>(initial.songs);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const added = new Set(songs.map((s) => s.id));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/songs?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { songs?: Hit[]; error?: string }) => {
          setError(d.error ?? null);
          setHits(d.songs ?? []);
        })
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => () => audioRef.current?.pause(), []);

  function preview(h: Hit) {
    if (!h.previewUrl) return;
    if (playing === h.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    const a = new Audio(h.previewUrl);
    a.volume = 0.4;
    a.onended = () => setPlaying(null);
    void a.play().catch(() => setPlaying(null));
    audioRef.current = a;
    setPlaying(h.id);
  }

  const visibleHits = q.trim().length >= 2 ? hits : [];

  return (
    <div className="space-y-4 rounded-2xl bg-night/40 p-3 sm:p-4">
      <div>
        <label htmlFor="pl-name" className="text-sm text-muted">
          ชื่อเพลย์ลิสต์
        </label>
        <input
          id="pl-name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border-2 border-stage-2 bg-night px-4 py-2.5 font-display text-lg focus:border-kho focus:outline-none"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="pl-search-h">
          <h3 id="pl-search-h" className="font-display text-lg">
            ค้นหาเพลง
          </h3>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ชื่อเพลงหรือศิลปิน"
            aria-label="ค้นหาเพลงบน Apple Music"
            className="mt-2 w-full rounded-xl border-2 border-stage-2 bg-night px-4 py-2.5 placeholder:text-muted/60 focus:border-kho focus:outline-none"
          />
          {error && (
            <div className="mt-2">
              <Banner tone="error">{error}</Banner>
            </div>
          )}
          <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1">
            {visibleHits.map((h) => {
              const isAdded = added.has(h.id);
              return (
                <li key={h.id} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-stage">
                  <button
                    type="button"
                    onClick={() => preview(h)}
                    aria-label={playing === h.id ? `หยุด ${h.title}` : `ฟังตัวอย่าง ${h.title}`}
                    className="relative size-11 shrink-0 overflow-hidden rounded-md bg-stage-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {h.artwork && <img src={h.artwork} alt="" className="size-11 object-cover" />}
                    <span className="absolute inset-0 grid place-items-center bg-deep/40 text-ink">{playing === h.id ? "■" : "▶"}</span>
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{h.title}</span>
                    <span className="block truncate text-sm text-muted">{h.artist}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isAdded}
                    onClick={() => setSongs((s) => [...s, { id: h.id, title: h.title, artist: h.artist, artwork: h.artwork }])}
                    className={`grid size-9 shrink-0 place-items-center rounded-full font-display text-lg ${isAdded ? "bg-good text-deep" : "bg-stage-2 hover:bg-kho hover:text-deep"}`}
                    aria-label={isAdded ? `${h.title} อยู่ในเพลย์ลิสต์แล้ว` : `เพิ่ม ${h.title}`}
                  >
                    {isAdded ? "✓" : "+"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="pl-songs-h">
          <h3 id="pl-songs-h" className="font-display text-lg">
            ในเพลย์ลิสต์ {songs.length} เพลง
          </h3>
          {songs.length < minSongs && (
            <p className="mt-1 text-sm text-muted">
              {songs.length < 4 ? "ต้องมีอย่างน้อย 4 เพลงถึงจะเล่นได้" : `ตั้งไว้ ${minSongs} ข้อ เพิ่มให้ถึง ${minSongs} เพลงจะได้ไม่ซ้ำ`}
            </p>
          )}
          <ol className="mt-2 max-h-80 space-y-1 overflow-y-auto pr-1">
            {songs.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 rounded-lg bg-stage p-1.5">
                <span className="w-6 text-right text-sm text-muted tabular-nums">{i + 1}</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.artwork ? <img src={s.artwork} alt="" className="size-9 rounded object-cover" /> : <span className="size-9 rounded bg-stage-2" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{s.title}</span>
                  <span className="block truncate text-sm text-muted">{s.artist}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSongs((all) => all.filter((x) => x.id !== s.id))}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-stage-2 hover:text-bad"
                  aria-label={`เอา ${s.title} ออก`}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex gap-2">
        <Button type="button" onClick={() => onDone({ ...initial, name: name.trim() || initial.name, songs })} className="!py-2.5 !text-base">
          บันทึกและใช้เพลย์ลิสต์นี้
        </Button>
        <Button type="button" tone="ghost" onClick={onCancel} className="!text-base">
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}
