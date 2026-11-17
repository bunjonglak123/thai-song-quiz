"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FinalView } from "@/components/final";
import { Lobby } from "@/components/lobby";
import { QuestionView, RevealView, StandingsView } from "@/components/play";
import { Avatar, Banner, Button, ColorPicker } from "@/components/ui";
import { getSfxEnabled, getVolume, setSfxEnabled, setVolume, sfx, stopClip, unlockAudio } from "@/lib/audio";
import { isHostOf, normalizeCode, PLAYER_COLORS, playerId, saveColor, savedColor, saveName, savedName } from "@/lib/identity";
import type { Member } from "@/lib/types";
import { useMounted } from "@/lib/use-mounted";
import { useRoom } from "@/lib/use-room";

export default function RoomClient() {
  const params = useParams<{ code: string }>();
  const code = normalizeCode(params.code ?? "");
  // Everything here depends on browser storage, so render it on the client only.
  if (!useMounted()) return <Shell />;
  return <Room code={code} />;
}

function Room({ code }: { code: string }) {
  const [me, setMe] = useState<Member | null>(null);
  const [isHost] = useState(() => isHostOf(code));
  const [name, setName] = useState(savedName);
  const [color, setColor] = useState(savedColor);

  // Every visit goes through this tap: it unlocks audio on phones.
  function join(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim().slice(0, 16);
    if (!n) return;
    saveName(n);
    saveColor(color);
    unlockAudio();
    setMe({ id: playerId(), name: n, color });
  }

  if (!me) {
    return (
      <Shell>
        <form onSubmit={join} className="grid gap-4 pt-6 md:grid-cols-2 md:items-center md:gap-16 md:pt-[12vh]">
          <div>
            <p className="text-muted lg:text-lg">{isHost ? "ห้องของคุณ" : "กำลังเข้าห้อง"}</p>
            <p className="font-display text-5xl tracking-[0.18em] md:text-7xl lg:text-8xl">{code}</p>
          </div>
          <div className="flex flex-col gap-4 md:rounded-3xl md:bg-stage/60 md:p-8">
            <label htmlFor="jname" className="mt-6 text-[15px] text-muted md:mt-0">
              ชื่อที่เพื่อนจะเห็น
            </label>
            <div className="flex items-center gap-3">
              <Avatar name={name || "?"} color={color} size="lg" />
              <input
                id="jname"
                value={name}
                maxLength={16}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น ภานุ"
                autoComplete="nickname"
                className="min-w-0 flex-1 rounded-2xl border-2 border-stage-2 bg-stage px-4 py-3.5 text-lg placeholder:text-muted/60 focus:border-kho focus:outline-none md:bg-night"
              />
            </div>
            <p className="text-[15px] text-muted">สีประจำตัว</p>
            <ColorPicker colors={PLAYER_COLORS} value={color} onChange={setColor} name={name} />
            <Button type="submit" disabled={!name.trim()}>
              {isHost ? "เปิดห้อง" : "เข้าห้อง"}
            </Button>
            <p className="text-sm text-muted">เปิดเสียงเครื่องไว้ เกมจะเล่นเพลงทันทีที่เริ่มแต่ละข้อ</p>
          </div>
        </form>
      </Shell>
    );
  }

  return <Game code={code} me={me} isHost={isHost} />;
}

function Game({ code, me, isHost: isCreator }: { code: string; me: Member; isHost: boolean }) {
  const { state, status, configured, answer, host, hostOnline, amHost, hostChange } = useRoom(code, me, isCreator);
  // Host controls follow the role, which can move to another player mid-game.
  const isHost = amHost;
  const [hostMissing, setHostMissing] = useState(false);
  const [dismissedAt, setDismissedAt] = useState(0);

  // Presence blips are common; only say the host is gone after a moment.
  useEffect(() => {
    if (isHost || !state || hostOnline) return;
    const t = setTimeout(() => setHostMissing(true), 2000);
    return () => {
      clearTimeout(t);
      setHostMissing(false);
    };
  }, [isHost, state, hostOnline]);

  // The "host changed" note shows for a few seconds after each change.
  useEffect(() => {
    if (!hostChange) return;
    const t = setTimeout(() => setDismissedAt(hostChange.at), 6000);
    return () => clearTimeout(t);
  }, [hostChange]);
  const showChange = !!hostChange && dismissedAt !== hostChange.at;

  useEffect(() => {
    if (state?.phase === "final" || state?.phase === "lobby") stopClip();
  }, [state?.phase]);
  useEffect(() => () => stopClip(), []);

  return (
    <Shell volume>
      <div className="space-y-4 pb-2 lg:pb-4">
        {!configured && (
          <Banner tone="warn">ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GAME_SERVER_URL รันเซิร์ฟเวอร์เกมด้วย docker compose up</Banner>
        )}
        {status === "waking" && !state && <Banner tone="info">กำลังปลุกเซิร์ฟเวอร์ อาจใช้เวลาสักครู่…</Banner>}
        {status === "error" && <Banner tone="error">เชื่อมต่อห้องไม่สำเร็จ ห้องอาจเต็ม หรือเปิดห้องนี้ไว้ในแท็บอื่น ลองรีเฟรชหน้านี้</Banner>}
        {status === "no-host" && !state && (
          <Banner tone="error">
            ไม่พบห้อง {code} ตรวจรหัสอีกครั้ง หรือรอให้หัวห้องเปิดหน้าเว็บค้างไว้{" "}
            <Link href="/" className="underline underline-offset-4">
              กลับหน้าแรก
            </Link>
          </Banner>
        )}
        {hostMissing && <Banner tone="warn">หัวห้องหลุดการเชื่อมต่อ เกมยังเดินต่อ ถ้าไม่กลับมา ระบบจะส่งปุ่มควบคุมให้คนถัดไป</Banner>}
        {showChange && hostChange && !hostMissing && (
          <Banner tone="info">
            {hostChange.me ? "หัวห้องเดิมหลุด ตอนนี้คุณควบคุมเกมแทน" : `หัวห้องเดิมหลุด ตอนนี้ ${hostChange.name} ควบคุมเกมแทน`}
          </Banner>
        )}
        {state?.phase === "final" && state.notice && <Banner tone="warn">{state.notice}</Banner>}
      </div>

      {!state ? (
        status !== "no-host" && <p className="pt-10 text-center text-muted">กำลังเชื่อมต่อห้อง {code}…</p>
      ) : state.phase === "lobby" || state.phase === "loading" ? (
        <Lobby code={code} state={state} meId={me.id} isHost={isHost} onSettings={host.updateSettings} onStart={host.start} />
      ) : state.phase === "question" && state.question ? (
        <QuestionView key={state.question.id} state={state} meId={me.id} isHost={isHost} onAnswer={answer} onRevealNow={host.revealNow} />
      ) : state.phase === "reveal" && state.reveal ? (
        <RevealView state={state} meId={me.id} isHost={isHost} onNext={host.next} />
      ) : state.phase === "standings" ? (
        <StandingsView key={state.round} state={state} meId={me.id} isHost={isHost} onNext={host.next} />
      ) : state.phase === "final" ? (
        <FinalView state={state} meId={me.id} isHost={isHost} onAgain={host.start} onLobby={host.backToLobby} />
      ) : null}
    </Shell>
  );
}

function Shell({ children, volume = false }: { children?: React.ReactNode; volume?: boolean }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl px-4 pb-10 pt-4 sm:px-6 lg:px-10 lg:pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:mb-8">
        <Link href="/" className="font-display text-lg text-muted hover:text-ink">
          ทายเพลงไทย
        </Link>
        {volume && <Volume />}
      </header>
      {children}
    </main>
  );
}

function Volume() {
  const [v, setV] = useState(getVolume);
  const [fx, setFx] = useState(getSfxEnabled);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-pressed={fx}
        onClick={() => {
          setSfxEnabled(!fx);
          setFx(!fx);
          if (!fx) sfx.click();
        }}
        className={`rounded-full border px-2.5 py-1 text-sm ${fx ? "border-kho text-ink" : "border-stage-2 text-muted line-through"}`}
        title="เสียงนับถอยหลังและเสียงกดปุ่ม"
      >
        เอฟเฟกต์
      </button>
      <label className="flex items-center gap-2 text-sm text-muted">
        <span className="hidden sm:inline">เสียง</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={v}
          onChange={(e) => {
            const n = Number(e.target.value);
            setV(n);
            setVolume(n);
          }}
          onPointerUp={() => sfx.tick()}
          className="w-20 accent-kho sm:w-24 lg:w-36"
          aria-label="ระดับเสียง"
        />
      </label>
    </div>
  );
}
