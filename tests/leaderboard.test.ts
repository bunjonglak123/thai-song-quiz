import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchLeaderboard, wakeServer } from "../src/lib/leaderboard.ts";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

test("fetchLeaderboard builds the URL and parses entries", async () => {
  const urls: string[] = [];
  const f = (async (u: RequestInfo | URL) => {
    urls.push(String(u));
    return ok([{ name: "เอ", score: 1500, correct: 5, rounds: 5, playedAt: "2026-11-17T01:00:00Z" }]);
  }) as typeof fetch;
  const rows = await fetchLeaderboard("week", f, "https://game.example");
  assert.equal(urls[0], "https://game.example/api/leaderboard?period=week&limit=20");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "เอ");
  assert.equal(rows[0].score, 1500);
});

test('non-200 throws "โหลดอันดับไม่สำเร็จ"', async () => {
  const f = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  await assert.rejects(fetchLeaderboard("all", f, "https://game.example"), /โหลดอันดับไม่สำเร็จ/);
});

test("fetchLeaderboard without a server URL throws instead of calling fetch", async () => {
  let called = false;
  const f = (async () => {
    called = true;
    return ok([]);
  }) as typeof fetch;
  await assert.rejects(fetchLeaderboard("all", f, ""), /โหลดอันดับไม่สำเร็จ/);
  assert.equal(called, false);
});

test("wakeServer never throws", async () => {
  const urls: string[] = [];
  const failing = (async (u: RequestInfo | URL) => {
    urls.push(String(u));
    throw new Error("offline");
  }) as typeof fetch;
  assert.doesNotThrow(() => wakeServer(failing, "https://game.example"));
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(urls, ["https://game.example/healthz"]);
  assert.doesNotThrow(() => wakeServer(failing, ""));
});
