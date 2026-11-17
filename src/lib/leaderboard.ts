// Leaderboard data from the game server, plus a wake-up ping for its free host.

import { GAME_SERVER_URL } from "./game-socket.ts";

export type LeaderboardEntry = { name: string; score: number; correct: number; rounds: number; playedAt: string };
export type Period = "week" | "all";

export async function fetchLeaderboard(period: Period, f: typeof fetch = fetch, base = GAME_SERVER_URL): Promise<LeaderboardEntry[]> {
  if (!base) throw new Error("โหลดอันดับไม่สำเร็จ");
  const res = await f(`${base}/api/leaderboard?period=${period}&limit=20`);
  if (!res.ok) throw new Error("โหลดอันดับไม่สำเร็จ");
  const rows = (await res.json()) as LeaderboardEntry[];
  return Array.isArray(rows) ? rows : [];
}

/** The free game-server host sleeps when idle; ping it early so it's awake by the time a room opens. */
export function wakeServer(f: typeof fetch = fetch, base = GAME_SERVER_URL): void {
  if (!base) return;
  try {
    f(`${base}/healthz`).catch(() => {});
  } catch {}
}
