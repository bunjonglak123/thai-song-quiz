"use client";

import type { GameState } from "@/lib/types";
import { Scoreboard } from "./play";
import { Button } from "./ui";

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
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-display text-lg text-muted">จบเกม</p>
        <h2 className="mt-1 font-display text-4xl leading-tight">
          {!top || top.score === 0 ? "ไม่มีใครได้คะแนนเลย" : tie ? "เสมอกันที่หนึ่ง" : `${top.name} ชนะ`}
        </h2>
        {top && top.score > 0 && <p className="mt-1 font-display text-2xl text-kho tabular-nums">{top.score} คะแนน</p>}
        {myRank > 1 && <p className="mt-3 text-muted">คุณได้อันดับ {myRank}</p>}
      </div>

      <Scoreboard state={state} meId={meId} />

      {isHost ? (
        <div className="grid gap-3">
          <Button onClick={onAgain}>เล่นอีกรอบ (สุ่มเพลงใหม่)</Button>
          <Button tone="secondary" onClick={onLobby}>
            เปลี่ยนเพลงหรือตั้งค่า
          </Button>
        </div>
      ) : (
        <p className="text-center text-muted">รอหัวห้องเริ่มรอบใหม่</p>
      )}
    </div>
  );
}
