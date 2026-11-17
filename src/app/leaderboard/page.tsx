import type { Metadata } from "next";
import { Suspense } from "react";
import LeaderboardClient from "./leaderboard-client";

export const metadata: Metadata = { title: "อันดับคะแนน · ทายเพลงไทย" };

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <LeaderboardClient />
    </Suspense>
  );
}
