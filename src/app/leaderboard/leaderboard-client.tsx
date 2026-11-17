"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "@/components/ui";
import { fetchLeaderboard, type LeaderboardEntry, type Period } from "@/lib/leaderboard";

const TABS: { id: Period; label: string }[] = [
  { id: "week", label: "สัปดาห์นี้" },
  { id: "all", label: "ตลอดกาล" },
];

const dateFmt = new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });

type Load = { period: Period; rows: LeaderboardEntry[] | null; error: string };

export default function LeaderboardClient() {
  const [period, setPeriod] = useState<Period>("week");
  const [data, setData] = useState<Load>({ period: "week", rows: null, error: "" });

  useEffect(() => {
    let live = true;
    fetchLeaderboard(period)
      .then((rows) => live && setData({ period, rows, error: "" }))
      .catch((e: unknown) => live && setData({ period, rows: [], error: e instanceof Error ? e.message : "โหลดอันดับไม่สำเร็จ" }));
    return () => {
      live = false;
    };
  }, [period]);

  const loading = data.period !== period || data.rows === null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 pb-10 pt-4 sm:px-6 lg:pt-6">
      <header className="mb-6 flex items-center justify-between gap-4 lg:mb-10">
        <Link href="/" className="font-display text-lg text-muted hover:text-ink">
          ทายเพลงไทย
        </Link>
      </header>

      <h1 className="font-display text-4xl leading-tight lg:text-6xl">อันดับคะแนน</h1>
      <p className="mt-2 text-muted">คะแนนสูงสุดต่อเกม นับเฉพาะเกมที่มีผู้เล่น 2 คนขึ้นไป และ 5 ข้อขึ้นไป</p>

      <div role="tablist" aria-label="ช่วงเวลา" className="mt-6 inline-flex rounded-2xl bg-stage p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={period === t.id}
            onClick={() => setPeriod(t.id)}
            className={`rounded-xl px-4 py-2 text-[15px] ${period === t.id ? "bg-kho text-deep" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section className="mt-6" aria-live="polite">
        {data.error && !loading && <Banner tone="error">{data.error}</Banner>}
        {loading ? (
          <p className="py-10 text-center text-muted">กำลังโหลดอันดับ…</p>
        ) : !data.error && data.rows!.length === 0 ? (
          <p className="py-10 text-center text-muted">ยังไม่มีเกมที่นับอันดับ (ต้องมีผู้เล่น 2 คนขึ้นไป และ 5 ข้อขึ้นไป)</p>
        ) : (
          <ol className="divide-y divide-stage-2 overflow-hidden rounded-2xl bg-stage/60">
            {data.rows!.map((r, i) => (
              <li key={`${r.name}-${r.playedAt}-${i}`} className="flex items-center gap-4 px-4 py-3">
                <span className="w-8 text-right font-display text-xl tabular-nums text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg">{r.name}</span>
                  <span className="text-sm text-muted">
                    ถูก {r.correct}/{r.rounds} ข้อ · {dateFmt.format(new Date(r.playedAt))}
                  </span>
                </span>
                <span className="font-display text-2xl tabular-nums text-kho">{r.score}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
