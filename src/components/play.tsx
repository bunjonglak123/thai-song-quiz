"use client";

import { useEffect, useRef, useState } from "react";
import { playClip, whenPlaying } from "@/lib/audio";
import type { GameState, PublicQuestion } from "@/lib/types";
import { Button, CHOICE_BG, CHOICE_MARKS, Equalizer } from "./ui";

export function QuestionView({
  state,
  meId,
  isHost,
  onAnswer,
  onRevealNow,
}: {
  state: GameState;
  meId: string;
  isHost: boolean;
  onAnswer: (questionId: string, choice: number, ms: number) => void;
  onRevealNow: () => void;
}) {
  const q = state.question!;
  // Parent remounts this view per question (key={question.id}), so state starts fresh.
  const [answered, setAnswered] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [left, setLeft] = useState(q.durationMs);
  const startRef = useRef<number | null>(null);

  // New question: play the clip, start the clock once sound actually starts.
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = await playClip(q.previewUrl, q.startAt);
      if (!alive) return;
      if (!ok) {
        setBlocked(true);
        startRef.current = performance.now(); // clock runs anyway, fairness over waiting
        return;
      }
      await whenPlaying();
      if (!alive) return;
      setPlaying(true);
      startRef.current = performance.now();
    })();
    return () => {
      alive = false;
    };
  }, [q.id, q.previewUrl, q.startAt, q.durationMs]);

  useEffect(() => {
    const t = setInterval(() => {
      if (startRef.current == null) return;
      setLeft(Math.max(0, q.durationMs - (performance.now() - startRef.current)));
    }, 100);
    return () => clearInterval(t);
  }, [q.id, q.durationMs]);

  async function retryPlay() {
    const ok = await playClip(q.previewUrl, q.startAt);
    if (ok) {
      setBlocked(false);
      setPlaying(true);
    }
  }

  const timeUp = left <= 0;
  const online = Object.values(state.players).filter((p) => p.online);
  const answeredCount = state.answered.filter((id) => state.players[id]?.online).length;

  function pick(i: number) {
    if (answered != null || timeUp) return;
    const ms = elapsedSince(startRef.current);
    setAnswered(i);
    onAnswer(q.id, i, Math.round(ms));
  }

  return (
    <div className="flex flex-col gap-6">
      <RoundHeader state={state} q={q} />

      <div className="h-2.5 overflow-hidden rounded-full bg-stage" role="progressbar" aria-label="เวลาที่เหลือ" aria-valuemin={0} aria-valuemax={q.durationMs / 1000} aria-valuenow={Math.ceil(left / 1000)}>
        <div
          className={`h-full rounded-full ${left < 4000 ? "bg-ko" : "bg-kho"}`}
          style={{ width: `${(left / q.durationMs) * 100}%`, transition: "width 100ms linear" }}
        />
      </div>

      <div className="flex min-h-28 flex-col items-center justify-center gap-3">
        {blocked ? (
          <Button onClick={retryPlay}>แตะเพื่อฟังเพลง</Button>
        ) : (
          <>
            <Equalizer playing={playing && !timeUp} />
            <p className="text-muted" aria-live="polite">
              {timeUp ? "หมดเวลา" : playing ? `${Math.ceil(left / 1000)} วินาที` : "กำลังโหลดเพลง…"}
            </p>
          </>
        )}
      </div>

      <ul className="grid gap-3" aria-label="ตัวเลือก">
        {q.choices.map((c, i) => {
          const chosen = answered === i;
          const dim = (answered != null && !chosen) || (timeUp && answered == null);
          return (
            <li key={i}>
              <button
                onClick={() => pick(i)}
                disabled={answered != null || timeUp}
                aria-pressed={chosen}
                className={`key flex w-full items-center gap-4 rounded-2xl p-3 pr-4 text-left text-deep ${CHOICE_BG[i]} ${
                  dim ? "opacity-35" : ""
                } ${chosen ? "ring-4 ring-ink ring-offset-2 ring-offset-night" : ""} disabled:cursor-default`}
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-deep/15 font-display text-3xl">{CHOICE_MARKS[i]}</span>
                <span className="min-w-0">
                  <span className="block font-display text-xl leading-snug break-words">{c.title}</span>
                  <span className="block truncate text-[15px] opacity-75">{c.artist}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between text-muted">
        <p aria-live="polite">
          {answered != null ? "ส่งคำตอบแล้ว " : ""}ตอบแล้ว {answeredCount}/{online.length} คน
        </p>
        {isHost && (
          <Button tone="ghost" className="!px-0 !py-1 !text-base" onClick={onRevealNow}>
            เฉลยเลย
          </Button>
        )}
      </div>
      {!online.some((p) => p.id === meId) && <p className="text-sm text-muted">คุณเข้ามากลางเกม คะแนนจะเริ่มนับจากข้อนี้</p>}
    </div>
  );
}

export function RevealView({
  state,
  meId,
  isHost,
  onNext,
}: {
  state: GameState;
  meId: string;
  isHost: boolean;
  onNext: () => void;
}) {
  const r = state.reveal!;
  const q = state.question!;
  const myPick = r.picks[meId];
  const correct = myPick?.choice === r.answer;
  const isLast = state.round + 1 >= state.totalRounds;

  const pickersOf = (i: number) =>
    Object.entries(r.picks)
      .filter(([, p]) => p.choice === i)
      .map(([id]) => state.players[id]?.name ?? "?");

  return (
    <div className="flex flex-col gap-6">
      <RoundHeader state={state} q={q} />

      <p className={`font-display text-3xl ${myPick ? (correct ? "text-good" : "text-bad") : "text-muted"}`} aria-live="polite">
        {myPick ? (correct ? `ถูกต้อง +${myPick.gain}` : "ยังไม่ใช่") : "ไม่ทันตอบ"}
      </p>

      <div className="flex items-center gap-4 rounded-2xl bg-stage p-3">
        {r.track.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.track.artwork} alt="" width={96} height={96} className="size-24 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="size-24 shrink-0 rounded-xl bg-stage-2" />
        )}
        <div className="min-w-0">
          <p className="font-display text-2xl leading-snug break-words">{r.track.title}</p>
          <p className="text-muted">{r.track.artist}</p>
          {r.track.storeUrl && (
            <a href={r.track.storeUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-ngo underline underline-offset-4">
              ฟังเต็มเพลงบน Apple Music
            </a>
          )}
        </div>
      </div>

      <ul className="grid gap-2" aria-label="ใครเลือกข้อไหน">
        {q.choices.map((c, i) => {
          const names = pickersOf(i);
          const isAns = i === r.answer;
          return (
            <li key={i} className={`flex items-center gap-3 rounded-xl p-2.5 ${isAns ? `${CHOICE_BG[i]} text-deep` : "bg-stage/70"}`}>
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-deep/15 font-display text-xl">{CHOICE_MARKS[i]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.title}</span>
                {names.length > 0 && <span className="block truncate text-sm opacity-80">{names.join(", ")}</span>}
              </span>
              {isAns && <span className="shrink-0 font-display">เฉลย</span>}
            </li>
          );
        })}
      </ul>

      <Scoreboard state={state} meId={meId} showGain />

      {isHost && (
        <Button tone="secondary" onClick={onNext}>
          {isLast ? "ดูผลรวม" : "ข้อต่อไป"}
        </Button>
      )}
    </div>
  );
}

function elapsedSince(start: number | null) {
  return start == null ? 0 : performance.now() - start;
}

function RoundHeader({ state, q }: { state: GameState; q: PublicQuestion }) {
  return (
    <p className="font-display text-lg text-muted">
      ข้อ {q.index + 1} จาก {state.totalRounds}
    </p>
  );
}

export function Scoreboard({ state, meId, showGain = false }: { state: GameState; meId: string; showGain?: boolean }) {
  const rows = Object.values(state.players)
    .filter((p) => p.online || p.score > 0)
    .sort((a, b) => b.score - a.score);
  return (
    <ol className="divide-y divide-stage-2 overflow-hidden rounded-2xl bg-stage" aria-label="คะแนน">
      {rows.map((p, i) => (
        <li key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${p.id === meId ? "bg-stage-2" : ""}`}>
          <span className="w-6 text-right font-display text-muted">{i + 1}</span>
          <span className={`min-w-0 flex-1 truncate ${p.online ? "" : "text-muted line-through"}`}>{p.name}</span>
          {showGain && !!p.lastGain && <span className="text-sm text-good">+{p.lastGain}</span>}
          {p.streak >= 2 && <span className="text-sm text-kho">ติด {p.streak}</span>}
          <span className="w-16 text-right font-display tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
