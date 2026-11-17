"use client";

import Link from "next/link";
import type { GameState } from "@/lib/types";
import { Scoreboard } from "./play";
import { Avatar, Button } from "./ui";

export function FinalView({
  state,
  meId,
  isHost,
  onAgain,
  onLobby,
}: {
  state: GameState;
  meId: string;
  isHost: boolean;
  onAgain: () => void;
  onLobby: () => void;
}) {
  const ranked = Object.values(state.players).sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const myRank = ranked.findIndex((p) => p.id === meId) + 1;
  const tie = ranked.length > 1 && ranked[1].score === top?.score;

  return (
    // Phones: winner, scores, buttons. Wide screens: winner + buttons left, scores right.
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-12">
      <div className="lg:col-start-1 lg:row-start-1 lg:pt-6">
        <p className="font-display text-lg text-muted">จบเกม</p>
        <h2 className="mt-1 font-display text-4xl leading-tight lg:text-7xl">
          {!top || top.score === 0 ? "ไม่มีใครได้คะแนนเลย" : tie ? "เสมอกันที่หนึ่ง" : `${top.name} ชนะ`}
        </h2>
        {top && top.score > 0 && <p className="mt-1 font-display text-2xl text-kho tabular-nums lg:text-4xl">{top.score} คะแนน</p>}
        {top && top.score > 0 && !tie && <Avatar name={top.name} color={top.color} size="lg" className="mt-4" />}
        {myRank > 1 && <p className="mt-3 text-muted">คุณได้อันดับ {myRank}</p>}
      </div>

      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <Scoreboard state={state} meId={meId} />
      </div>

      <div className="lg:col-start-1 lg:row-start-2">
        {isHost ? (
          <div className="grid gap-3 lg:max-w-sm">
            <Button onClick={onAgain}>เล่นอีกรอบ (สุ่มเพลงใหม่)</Button>
            <Button tone="secondary" onClick={onLobby}>
              เปลี่ยนเพลงหรือตั้งค่า
            </Button>
          </div>
        ) : (
          <p className="text-center text-muted lg:text-left">รอหัวห้องเริ่มรอบใหม่</p>
        )}
        <Link href="/leaderboard" target="_blank" className="mt-4 block text-center text-muted underline underline-offset-4 hover:text-ink lg:text-left">
          ดูอันดับคะแนนสูงสุด
        </Link>
      </div>
    </div>
  );
}
