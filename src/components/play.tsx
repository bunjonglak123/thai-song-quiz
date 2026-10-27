"use client";

import { useEffect, useRef, useState } from "react";
import { playClip } from "@/lib/audio";
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
  const [audio, setAudio] = useState<"loading" | "playing" | "blocked" | "error">("loading");
  const [startedAt, setStartedAt] = useState<number | null>(null); // when sound began
  const [now, setNow] = useState(0);
  const unlockAtRef = useRef<number | null>(null);

  // Play the clip; the listening clock starts when sound actually starts.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await playClip(q.previewUrl, q.startAt);
      if (!alive || r === "superseded") return;
      const t = performance.now();
      unlockAtRef.current = t + q.lockMs;
      setAudio(r === "ok" ? "playing" : r);
      setStartedAt(t);
      setNow(t);
    })();
    return () => {
      alive = false;
    };
  }, [q.previewUrl, q.startAt, q.lockMs]);

  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);

  async function retryPlay() {
    const r = await playClip(q.previewUrl, q.startAt);
    if (r === "ok") setAudio("playing");
  }

  const sinceStart = startedAt == null ? 0 : Math.max(0, now - startedAt);
  const listening = startedAt == null || sinceStart < q.lockMs;
  const listenLeft = Math.max(0, q.lockMs - sinceStart);
  const answerLeft = startedAt == null ? q.durationMs : Math.max(0, q.durationMs - Math.max(0, sinceStart - q.lockMs));
  const timeUp = !listening && answerLeft <= 0;
  const online = Object.values(state.players).filter((p) => p.online);
  // Other players' picks become visible only once you've locked in your own answer.
  const showPicks = answered != null;
  const pickersOf = (i: number) =>
    Object.entries(state.livePicks ?? {})
      .filter(([, c]) => c === i)
      .map(([id]) => ({ id, name: id === meId ? "คุณ" : (state.players[id]?.name ?? "?") }));
  const answeredCount = state.answered.filter((id) => state.players[id]?.online).length;

  function pick(i: number) {
    if (answered != null || listening || timeUp) return;
    setAnswered(i);
    onAnswer(q.id, i, Math.round(elapsedSince(unlockAtRef.current)));
  }

  const status =
    startedAt == null
      ? "กำลังโหลดเพลง…"
      : listening
        ? `ฟังก่อน ${Math.ceil(listenLeft / 1000)}`
        : timeUp
          ? "หมดเวลา"
          : `${Math.ceil(answerLeft / 1000)} วินาที`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
      <div className="flex flex-col gap-6 lg:gap-8">
        <RoundHeader state={state} q={q} />

        <div
          className="h-2.5 overflow-hidden rounded-full bg-stage lg:h-3"
          role="progressbar"
          aria-label="เวลาตอบที่เหลือ"
          aria-valuemin={0}
          aria-valuemax={q.durationMs / 1000}
          aria-valuenow={Math.ceil(answerLeft / 1000)}
        >
          <div
            className={`h-full rounded-full ${listening ? "bg-muted/40" : answerLeft < 4000 ? "bg-ko" : "bg-kho"}`}
            style={{ width: `${(answerLeft / q.durationMs) * 100}%`, transition: "width 100ms linear" }}
          />
        </div>

        <div className="flex min-h-28 flex-col items-center justify-center gap-3 lg:min-h-48 lg:rounded-3xl lg:bg-stage/50">
          {audio === "blocked" ? (
            <Button onClick={retryPlay}>แตะเพื่อฟังเพลง</Button>
          ) : (
            <>
              <Equalizer playing={audio === "playing" && !timeUp} />
              <p
                className={listening && startedAt != null ? "font-display text-2xl lg:text-4xl" : "text-muted lg:text-lg"}
                aria-live="polite"
              >
                {audio === "error" ? "โหลดเพลงข้อนี้ไม่สำเร็จ เดาได้เลย" : status}
              </p>
            </>
          )}
        </div>

        <ul className="grid gap-3 md:grid-cols-2 md:gap-4" aria-label="ตัวเลือก">
          {q.choices.map((c, i) => {
            const chosen = answered === i;
            const dim = (answered != null && !chosen) || (timeUp && answered == null);
            return (
              <li key={i}>
                <button
                  onClick={() => pick(i)}
                  disabled={listening || answered != null || timeUp}
                  aria-pressed={chosen}
                  className={`key flex h-full min-h-[4.5rem] w-full items-center gap-4 rounded-2xl p-3 pr-4 text-left text-deep md:min-h-28 md:p-4 lg:min-h-32 ${CHOICE_BG[i]} ${
                    dim ? "opacity-35" : ""
                  } ${listening ? "opacity-60" : ""} ${chosen ? "ring-4 ring-ink ring-offset-2 ring-offset-night" : ""} disabled:cursor-default`}
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-deep/15 font-display text-3xl md:size-16 md:text-4xl">
                    {CHOICE_MARKS[i]}
                  </span>
                  {/* Titles stay hidden while listening, so everyone has to actually listen. */}
                  {listening ? (
                    <span aria-hidden className="h-5 w-2/3 rounded-full bg-deep/15" />
                  ) : (
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-xl leading-snug break-words md:text-2xl">{c.title}</span>
                      {showPicks && pickersOf(i).length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {pickersOf(i).map((p) => (
                            <span key={p.id} className={`rounded-full px-2 py-0.5 text-sm ${p.id === meId ? "bg-deep text-ink" : "bg-deep/15"}`}>
                              {p.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  )}
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

      {/* Wide screens: who has answered, next to the game */}
      <aside className="hidden lg:block" aria-label="สถานะผู้เล่น">
        <h2 className="font-display text-lg text-muted">ผู้เล่น</h2>
        <ul className="mt-3 divide-y divide-stage-2 overflow-hidden rounded-2xl bg-stage">
          {[...online]
            .sort((a, b) => b.score - a.score)
            .map((p) => {
              const done = state.answered.includes(p.id);
              const pick = showPicks ? state.livePicks?.[p.id] : undefined;
              return (
                <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.id === meId ? "bg-stage-2" : ""}`}>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {pick != null ? (
                    <span className={`grid size-7 place-items-center rounded-lg font-display text-deep ${CHOICE_BG[pick]}`} aria-label={`เลือกข้อ ${CHOICE_MARKS[pick]}`}>
                      {CHOICE_MARKS[pick]}
                    </span>
                  ) : (
                    <span className={`text-sm ${done ? "text-good" : "text-muted"}`}>{done ? "ตอบแล้ว" : "กำลังคิด"}</span>
                  )}
                  <span className="w-14 text-right font-display tabular-nums">{p.score}</span>
                </li>
              );
            })}
        </ul>
      </aside>
    </div>
  );
}

export function RevealView({ state, meId, isHost, onNext }: { state: GameState; meId: string; isHost: boolean; onNext: () => void }) {
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <div className="flex flex-col gap-6">
        <RoundHeader state={state} q={q} />

        <p
          className={`font-display text-3xl lg:text-5xl ${myPick ? (correct ? "text-good" : "text-bad") : "text-muted"}`}
          aria-live="polite"
        >
          {myPick ? (correct ? `ถูกต้อง +${myPick.gain}` : "ยังไม่ใช่") : "ไม่ทันตอบ"}
        </p>

        <div className="flex items-center gap-4 rounded-2xl bg-stage p-3 lg:gap-6 lg:p-5">
          {r.track.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.track.artwork} alt="" width={160} height={160} className="size-24 shrink-0 rounded-xl object-cover lg:size-40" />
          ) : (
            <div className="size-24 shrink-0 rounded-xl bg-stage-2 lg:size-40" />
          )}
          <div className="min-w-0">
            <p className="font-display text-2xl leading-snug break-words lg:text-4xl">{r.track.title}</p>
            <p className="text-muted lg:text-xl">{r.track.artist}</p>
            {r.track.storeUrl && (
              <a
                href={r.track.storeUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-ngo underline underline-offset-4"
              >
                ฟังเต็มเพลงบน Apple Music
              </a>
            )}
          </div>
        </div>

        <ul className="grid gap-2 md:grid-cols-2" aria-label="ใครเลือกข้อไหน">
          {(r.choices ?? q.choices).map((c, i) => {
            const names = pickersOf(i);
            const isAns = i === r.answer;
            return (
              <li key={i} className={`flex items-center gap-3 rounded-xl p-2.5 ${isAns ? `${CHOICE_BG[i]} text-deep` : "bg-stage/70"}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-deep/15 font-display text-xl">
                  {CHOICE_MARKS[i]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {c.title}
                    {c.artist && <span className="font-normal opacity-70"> – {c.artist}</span>}
                  </span>
                  {names.length > 0 && <span className="block truncate text-sm opacity-80">{names.join(", ")}</span>}
                </span>
                {isAns && <span className="shrink-0 font-display">เฉลย</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <aside className="flex flex-col gap-4 lg:pt-11">
        <h2 className="font-display text-lg text-muted">ข้อนี้</h2>
        <RoundResults state={state} meId={meId} />
        {isHost && (
          <Button tone="secondary" onClick={onNext}>
            {isLast ? "ดูผลรวม" : "ดูอันดับ"}
          </Button>
        )}
      </aside>
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

/** Who got this question right, fastest first. */
function RoundResults({ state, meId }: { state: GameState; meId: string }) {
  const r = state.reveal!;
  const rows = Object.values(state.players)
    .filter((p) => p.online || r.picks[p.id])
    .map((p) => ({ p, pick: r.picks[p.id] }))
    .sort((a, b) => (b.pick?.gain ?? -1) - (a.pick?.gain ?? -1) || (a.pick?.ms ?? 1e9) - (b.pick?.ms ?? 1e9));
  return (
    <ol className="divide-y divide-stage-2 overflow-hidden rounded-2xl bg-stage" aria-label="ผลข้อนี้">
      {rows.map(({ p, pick }) => {
        const correct = pick && pick.choice === r.answer;
        return (
          <li key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${p.id === meId ? "bg-stage-2" : ""}`}>
            <span className={`w-5 text-center font-display ${correct ? "text-good" : pick ? "text-bad" : "text-muted"}`} aria-hidden>
              {correct ? "✓" : pick ? "✗" : "–"}
            </span>
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {pick && <span className="text-sm text-muted tabular-nums">{(pick.ms / 1000).toFixed(1)} วิ</span>}
            <span className={`w-14 text-right font-display tabular-nums ${correct ? "text-good" : "text-muted"}`}>
              {correct ? `+${pick!.gain}` : "0"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const ROW_H = 60; // px, fixed so rows can slide between positions

/** Leaderboard between questions: rows start at their old rank and slide to the new one. */
export function StandingsView({
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
  const ranks = rankNow(state);
  const rows = Object.values(state.players).filter((p) => p.online || p.score > 0);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 700);
    return () => clearTimeout(t);
  }, []);

  // Order rows by previous rank first, then by the new rank once settled.
  const oldOrder = [...rows].sort((a, b) => (a.prevRank ?? 99) - (b.prevRank ?? 99) || b.score - (b.lastGain ?? 0) - (a.score - (a.lastGain ?? 0)));
  const newOrder = [...rows].sort((a, b) => b.score - a.score);
  const slot = new Map((settled ? newOrder : oldOrder).map((p, i) => [p.id, i]));
  const me = state.players[meId];
  const myMove = me?.prevRank && ranks[meId] ? me.prevRank - ranks[meId] : 0;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <p className="font-display text-lg text-muted">
          หลังข้อ {state.round + 1} จาก {state.totalRounds}
        </p>
        <h2 className="mt-1 font-display text-4xl lg:text-5xl">อันดับตอนนี้</h2>
        {me && ranks[meId] && (
          <p className="mt-2 text-lg text-muted" aria-live="polite">
            คุณอยู่อันดับ {ranks[meId]}
            {myMove > 0 && <span className="text-good"> ขึ้นมา {myMove} อันดับ</span>}
            {myMove < 0 && <span className="text-bad"> ตกลง {-myMove} อันดับ</span>}
          </p>
        )}
      </div>

      <ol className="relative" style={{ height: rows.length * ROW_H }} aria-label="อันดับ">
        {newOrder.map((p) => {
          const rank = ranks[p.id];
          const move = p.prevRank ? p.prevRank - rank : 0;
          const medal = rank === 1 ? "bg-kho text-deep" : rank === 2 ? "bg-ngo text-deep" : rank === 3 ? "bg-ko text-deep" : "bg-stage-2";
          return (
            <li
              key={p.id}
              className={`standing-row absolute inset-x-0 flex items-center gap-3 rounded-2xl px-3 ${p.id === meId ? "bg-stage-2 ring-2 ring-kho" : "bg-stage"}`}
              style={{ height: ROW_H - 8, transform: `translateY(${(slot.get(p.id) ?? 0) * ROW_H}px)` }}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl font-display text-lg ${medal}`}>{rank}</span>
              <span className={`min-w-0 flex-1 truncate text-lg ${p.online ? "" : "text-muted line-through"}`}>{p.name}</span>
              {settled && move !== 0 && (
                <span className={`text-sm ${move > 0 ? "text-good" : "text-bad"}`} aria-label={move > 0 ? `ขึ้น ${move}` : `ลง ${-move}`}>
                  {move > 0 ? `▲${move}` : `▼${-move}`}
                </span>
              )}
              {!!p.lastGain && <span className="text-sm text-good tabular-nums">+{p.lastGain}</span>}
              <span className="w-16 text-right font-display text-lg tabular-nums">{p.score}</span>
            </li>
          );
        })}
      </ol>

      {isHost && (
        <Button tone="secondary" onClick={onNext} className="self-start">
          ข้อต่อไป
        </Button>
      )}
    </div>
  );
}

function rankNow(state: GameState) {
  const sorted = Object.values(state.players).sort((a, b) => b.score - a.score);
  const out: Record<string, number> = {};
  sorted.forEach((p, i) => {
    out[p.id] = i > 0 && sorted[i - 1].score === p.score ? out[sorted[i - 1].id] : i + 1;
  });
  return out;
}
