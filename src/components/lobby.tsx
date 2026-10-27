"use client";

import { useState } from "react";
import type { GameSettings, GameState } from "@/lib/types";
import { ArtistPicker } from "./artist-picker";
import { Banner, Button } from "./ui";

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
  const artistCount = s.source.kind === "artists" ? s.source.artists.length : 0;
  const canStart = !loading && (s.source.kind === "chart" || artistCount > 0);

  const start = (
    <>
      <Button className="w-full" onClick={onStart} disabled={!canStart}>
        {loading ? "กำลังโหลดเพลง…" : "เริ่มเกม"}
      </Button>
      {!canStart && !loading && <p className="mt-2 text-center text-sm text-muted">เลือกศิลปินอย่างน้อย 1 คนก่อนเริ่ม</p>}
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
              <li key={p.id} className="rounded-full bg-stage px-3.5 py-1.5 lg:bg-stage-2">
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
  // Keep the artist list around when the host flips to the chart and back.
  const [artists, setArtists] = useState<string[]>(src.kind === "artists" ? src.artists : []);

  const setArtistsAndSync = (a: string[]) => {
    setArtists(a);
    onChange({ ...settings, source: { kind: "artists", artists: a } });
  };

  return (
    <fieldset disabled={disabled} className="space-y-6 disabled:opacity-60">
      <section>
        <h2 className="font-display text-xl">เลือกเพลงจาก</h2>
        <div role="radiogroup" className="mt-3 grid grid-cols-2 gap-2">
          <Option
            selected={src.kind === "chart"}
            onClick={() => onChange({ ...settings, source: { kind: "chart", size: 100 } })}
            title="ชาร์ตเพลงไทยตอนนี้"
            detail="100 เพลงที่คนไทยฟังเยอะสุดบน Apple Music"
          />
          <Option
            selected={src.kind === "artists"}
            onClick={() => onChange({ ...settings, source: { kind: "artists", artists } })}
            title="เลือกศิลปินเอง"
            detail="สุ่มเพลงจากศิลปินที่เลือก สูงสุด 8 คน"
          />
        </div>
        {src.kind === "artists" && (
          <div className="mt-4">
            <ArtistPicker value={artists} onChange={setArtistsAndSync} />
          </div>
        )}
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
  const src = s.source.kind === "chart" ? "ชาร์ตเพลงไทยตอนนี้ (Apple Music)" : `ศิลปิน: ${s.source.artists.join(", ") || "ยังไม่ได้เลือก"}`;
  const listen = s.listenSeconds ? `ฟังก่อน ${s.listenSeconds} วิ แล้วตอบใน ${s.roundSeconds} วิ` : `ตอบใน ${s.roundSeconds} วิ`;
  return `${src} · ${s.rounds} ข้อ · ${listen}`;
}
