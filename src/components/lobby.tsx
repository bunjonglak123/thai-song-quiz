"use client";

import { useState } from "react";
import { PRESETS, presetById } from "@/lib/presets";
import type { GameSettings, GameState, SongSource } from "@/lib/types";
import { ArtistPicker } from "./artist-picker";
import { MyPlaylistPicker } from "./my-playlists";
import { PresetPicker, SpotifyPicker, YouTubePicker } from "./source-pickers";
import { Avatar, Banner, Button } from "./ui";

export function Lobby({
  code,
  state,
  meId,
  isHost,
  onSettings,
  onStart,
}: {
  code: string;
  state: GameState;
  meId: string;
  isHost: boolean;
  onSettings: (s: GameSettings) => void;
  onStart: () => void;
}) {
  const players = Object.values(state.players).filter((p) => p.online);
  const s = state.settings;
  const loading = state.phase === "loading";
  const missing = whatsMissing(s);
  const canStart = !loading && !missing;

  const start = (
    <>
      <Button className="w-full" onClick={onStart} disabled={!canStart}>
        {loading ? "กำลังโหลดเพลง…" : "เริ่มเกม"}
      </Button>
      {missing && !loading && <p className="mt-2 text-center text-sm text-muted">{missing}</p>}
    </>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12">
      {/* Room code, players and the start button: top on phones, right column on wide screens */}
      <aside className="space-y-8 lg:sticky lg:top-6 lg:order-2 lg:rounded-3xl lg:bg-stage/60 lg:p-6">
        <RoomCode code={code} />

        <section aria-labelledby="players-h">
          <h2 id="players-h" className="font-display text-xl">
            ในห้อง {players.length} คน
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-full bg-stage py-1 pl-1 pr-3.5 lg:bg-stage-2">
                <Avatar name={p.name} color={p.color} />
                {p.name}
                {p.id === state.hostId && <span className="ml-1.5 text-sm text-kho">หัวห้อง</span>}
                {p.id === meId && p.id !== state.hostId && <span className="ml-1.5 text-sm text-muted">(คุณ)</span>}
              </li>
            ))}
          </ul>
        </section>

        {isHost && <div className="hidden lg:block">{start}</div>}
      </aside>

      <div className="space-y-8 lg:order-1">
        {state.error && <Banner tone="error">{state.error}</Banner>}
        {state.notice && <Banner tone="warn">{state.notice}</Banner>}

        {isHost ? (
          <HostSettings settings={s} onChange={onSettings} disabled={loading} />
        ) : (
          <section className="rounded-2xl bg-stage p-4 lg:p-8">
            <h2 className="font-display text-xl lg:text-3xl">เพลงรอบนี้</h2>
            <p className="mt-2 text-muted">{describe(s)}</p>
            <p className="mt-4">{loading ? "หัวห้องกำลังโหลดเพลง…" : "รอหัวห้องกดเริ่มเกม"}</p>
          </section>
        )}

        {isHost && <div className="sticky bottom-4 lg:hidden">{start}</div>}
      </div>
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = `${location.origin}/room/${code}`;
    try {
      if (navigator.share) await navigator.share({ title: "มาทายเพลงไทยกัน", text: `รหัสห้อง ${code}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  }
  return (
    <section className="flex items-end justify-between gap-4 lg:flex-col lg:items-stretch">
      <div>
        <p className="text-muted">รหัสห้อง</p>
        <p className="font-display text-5xl tracking-[0.18em] lg:text-6xl">{code}</p>
      </div>
      <Button tone="secondary" className="shrink-0 !py-2.5 !text-base lg:w-full" onClick={share}>
        {copied ? "คัดลอกลิงก์แล้ว" : "ส่งลิงก์ชวนเพื่อน"}
      </Button>
    </section>
  );
}

function HostSettings({
  settings,
  onChange,
  disabled,
}: {
  settings: GameSettings;
  onChange: (s: GameSettings) => void;
  disabled: boolean;
}) {
  const src = settings.source;
  // Remember each mode's choice, so flipping between modes doesn't lose it.
  const [artists, setArtists] = useState<string[]>(src.kind === "artists" ? src.artists : []);
  const [presetId, setPresetId] = useState(src.kind === "preset" ? src.id : PRESETS[0].id);
  const [spotify, setSpotify] = useState<Extract<SongSource, { kind: "spotify" }> | undefined>(src.kind === "spotify" ? src : undefined);
  const [custom, setCustom] = useState<Extract<SongSource, { kind: "custom" }> | undefined>(src.kind === "custom" ? src : undefined);
  const [youtube, setYoutube] = useState<Extract<SongSource, { kind: "youtube" }> | undefined>(src.kind === "youtube" ? src : undefined);

  const setSource = (source: SongSource) => onChange({ ...settings, source });
  // An empty selection is stored with a blank id; whatsMissing() then asks the host to pick one.
  const spotifySource = (v = spotify): SongSource => v ?? { kind: "spotify", playlistId: "", name: "" };
  const youtubeSource = (v = youtube): SongSource => v ?? { kind: "youtube", playlistId: "" };
  const customSource = (v = custom): SongSource => v ?? { kind: "custom", name: "", trackIds: [] };

  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
      <section>
        <h2 className="font-display text-xl">เลือกเพลงจาก</h2>
        <div role="radiogroup" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Option
            selected={src.kind === "chart"}
            onClick={() => setSource({ kind: "chart", size: 100 })}
            title="ชาร์ตตอนนี้"
            detail="100 เพลงที่คนไทยฟังเยอะสุดบน Apple Music"
          />
          <Option
            selected={src.kind === "preset"}
            onClick={() => setSource({ kind: "preset", id: presetId })}
            title="ชุดเพลง"
            detail="ร็อก 2000, ป๊อป 90, ลูกทุ่ง, อกหัก…"
          />
          <Option
            selected={src.kind === "artists"}
            onClick={() => setSource({ kind: "artists", artists })}
            title="เลือกศิลปินเอง"
            detail="สุ่มจากศิลปินที่เลือก สูงสุด 8 คน"
          />
          <Option
            selected={src.kind === "custom"}
            onClick={() => setSource(customSource())}
            title="เพลย์ลิสต์ของฉัน"
            detail="ค้นหาเพลงมาจัดเอง เล่นได้ทุกเพลง"
          />
          <Option
            selected={src.kind === "spotify"}
            onClick={() => setSource(spotifySource())}
            title="Spotify playlist"
            detail="เพลย์ลิสต์ของหัวห้อง"
          />
          <Option
            selected={src.kind === "youtube"}
            onClick={() => setSource(youtubeSource())}
            title="YouTube playlist"
            detail="ค้นหาหรือวางลิงก์เพลย์ลิสต์"
          />
        </div>

        <div className="mt-4">
          {src.kind === "preset" && (
            <PresetPicker
              value={src.id}
              onPick={(id) => {
                setPresetId(id);
                setSource({ kind: "preset", id });
              }}
            />
          )}
          {src.kind === "artists" && (
            <ArtistPicker
              value={artists}
              onChange={(a) => {
                setArtists(a);
                setSource({ kind: "artists", artists: a });
              }}
            />
          )}
          {src.kind === "custom" && (
            <MyPlaylistPicker
              selectedId={src.listId}
              minSongs={settings.rounds}
              onPick={(p) => {
                const v = p
                  ? { kind: "custom" as const, name: p.name, trackIds: p.songs.map((s) => s.id), listId: p.id }
                  : { kind: "custom" as const, name: "", trackIds: [] };
                setCustom(v);
                setSource(v);
              }}
            />
          )}
          {src.kind === "spotify" && (
            <SpotifyPicker
              value={spotify}
              onPick={(p) => {
                const v = { kind: "spotify" as const, playlistId: p.id, name: p.name, count: p.count ?? undefined };
                setSpotify(v);
                setSource(v);
              }}
            />
          )}
          {src.kind === "youtube" && (
            <YouTubePicker
              value={youtube?.playlistId ? youtube : undefined}
              onPick={(p) => {
                const v = { kind: "youtube" as const, playlistId: p.playlistId, name: p.name };
                setYoutube(v);
                setSource(v);
              }}
            />
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3 md:gap-x-6">
        <div className="col-span-2 md:col-span-1">
          <Stepper
            label="จำนวนข้อ"
            options={[5, 10, 15, 20]}
            value={settings.rounds}
            onChange={(rounds) => onChange({ ...settings, rounds })}
            unit="ข้อ"
          />
        </div>
        <Stepper
          label="ฟังก่อนตอบ"
          hint="ตัวเลือกยังไม่ขึ้น"
          options={[0, 3, 5]}
          value={settings.listenSeconds ?? 3}
          onChange={(listenSeconds) => onChange({ ...settings, listenSeconds })}
          unit="วิ"
        />
        <Stepper
          label="เวลาตอบ"
          hint="หลังตัวเลือกขึ้น"
          options={[10, 15, 20]}
          value={settings.roundSeconds}
          onChange={(roundSeconds) => onChange({ ...settings, roundSeconds })}
          unit="วิ"
        />
      </section>
    </fieldset>
  );
}

function Option({ selected, onClick, title, detail }: { selected: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-2xl border-2 p-3.5 text-left transition-colors ${
        selected ? "border-kho bg-stage-2" : "border-stage-2 bg-stage hover:border-muted/50"
      }`}
    >
      <span className="block font-display text-lg leading-snug">{title}</span>
      <span className="mt-1 block text-sm leading-snug text-muted">{detail}</span>
    </button>
  );
}

function Stepper({
  label,
  hint,
  options,
  value,
  onChange,
  unit,
}: {
  label: string;
  hint?: string;
  options: number[];
  value: number;
  onChange: (n: number) => void;
  unit: string;
}) {
  return (
    <div>
      <p className="font-display text-lg">{label}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <div role="radiogroup" aria-label={label} className="mt-2 flex overflow-hidden rounded-xl border-2 border-stage-2">
        {options.map((o) => (
          <button
            key={o}
            role="radio"
            aria-checked={o === value}
            aria-label={`${o} ${unit}`}
            onClick={() => onChange(o)}
            className={`flex-1 py-2.5 font-display text-lg ${o === value ? "bg-kho text-deep" : "bg-stage hover:bg-stage-2"}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function describe(s: GameSettings) {
  const src = s.source;
  const what =
    src.kind === "chart"
      ? "ชาร์ตเพลงไทยตอนนี้ (Apple Music)"
      : src.kind === "artists"
        ? `ศิลปิน: ${src.artists.join(", ") || "ยังไม่ได้เลือก"}`
        : src.kind === "preset"
          ? `ชุดเพลง: ${presetById(src.id)?.name ?? "-"}`
          : src.kind === "spotify"
            ? `Spotify: ${src.name || "ยังไม่ได้เลือก"}`
            : src.kind === "custom"
              ? `เพลย์ลิสต์ของหัวห้อง: ${src.name || "ยังไม่ได้เลือก"}`
              : `YouTube: ${src.name || "ยังไม่ได้เลือก"}`;
  const listen = s.listenSeconds ? `ฟังก่อน ${s.listenSeconds} วิ แล้วตอบใน ${s.roundSeconds} วิ` : `ตอบใน ${s.roundSeconds} วิ`;
  return `${what} · ${s.rounds} ข้อ · ${listen}`;
}

/** What the host still has to choose before starting, or null when ready. */
function whatsMissing(s: GameSettings): string | null {
  const src = s.source;
  if (src.kind === "artists" && !src.artists.length) return "เลือกศิลปินอย่างน้อย 1 คนก่อนเริ่ม";
  if (src.kind === "preset" && !presetById(src.id)) return "เลือกชุดเพลงก่อนเริ่ม";
  if (src.kind === "spotify" && !src.playlistId) return "เลือกเพลย์ลิสต์ Spotify ก่อนเริ่ม";
  if (src.kind === "youtube" && !src.playlistId) return "ค้นหาหรือวางลิงก์เพลย์ลิสต์ YouTube ก่อนเริ่ม";
  if (src.kind === "custom" && src.trackIds.length < 4) return "เลือกหรือสร้างเพลย์ลิสต์ที่มีอย่างน้อย 4 เพลงก่อนเริ่ม";
  return null;
}
