// End-to-end protocol test: one host + two players over the BroadcastChannel transport,
// wired the same way src/lib/use-room.ts wires them (minus React).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport, hasSupabase, type RoomTransport } from "../src/lib/transport.ts";
import { HostEngine } from "../src/lib/host-engine.ts";
import type { GameState, HostQuestion } from "../src/lib/types.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timed out");
    await wait(20);
  }
}

function questions(n: number): HostQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    startAt: 0,
    answer: 2,
    track: { id: `t${i}`, title: `เพลง ${i}`, rawTitle: `เพลง ${i}`, artist: "ศิลปิน", previewUrl: `https://x/${i}.m4a` },
    choices: [0, 1, 2, 3].map((c) => ({ title: `ตัวเลือก ${i}-${c}`, artist: "ศิลปิน" })),
  }));
}

function player(room: string, id: string, name: string) {
  const t = createTransport(room, { id, name });
  const seen: GameState[] = [];
  t.on("state", (d) => seen.push(d as GameState));
  return { t, seen, last: () => seen[seen.length - 1] };
}

test("host + 2 players play a 2-round game over the local transport", async () => {
  assert.equal(hasSupabase, false);
  const room = "T" + Math.random().toString(36).slice(2, 7);
  const ht: RoomTransport = createTransport(room, { id: "host", name: "โฮสต์" });
  const engine = new HostEngine({
    hostId: "host",
    hostName: "โฮสต์",
    onChange: (s) => ht.send("state", s),
    fetchQuestions: async () => ({ questions: questions(2), warnings: [] }),
  });
  ht.on("hello", () => ht.send("state", engine.state));
  ht.on("answer", (d, from) => {
    const a = d as { questionId: string; choice: number; ms: number };
    engine.answer({ playerId: from, ...a });
  });
  ht.onMembers((m) => engine.syncMembers(m));
  await ht.connect();

  const a = player(room, "pa", "เอ");
  const b = player(room, "pb", "บี");
  await a.t.connect();
  await b.t.connect();
  a.t.send("hello", null);

  await until(() => !!a.last() && Object.keys(a.last().players).length === 3);
  await until(() => !!b.last() && Object.keys(b.last().players).length === 3);
  assert.equal(a.last().phase, "lobby");

  await engine.start();
  await until(() => a.last().phase === "question");
  const q = a.last().question!;
  assert.ok(!JSON.stringify(a.seen).includes('"answer":2'), "answer never sent before reveal");

  a.t.send("answer", { questionId: q.id, choice: 2, ms: 1500 }); // right
  b.t.send("answer", { questionId: q.id, choice: 0, ms: 500 }); // wrong
  engine.answer({ playerId: "host", questionId: q.id, choice: 2, ms: 7500 }); // right, slower

  await until(() => b.last().phase === "reveal", 3000);
  const r = b.last();
  assert.equal(r.reveal!.answer, 2);
  assert.equal(r.players.pa.score, 950);
  assert.equal(r.players.host.score, 750);
  assert.equal(r.players.pb.score, 0);

  // Player B disconnects; next round must not wait for them.
  b.t.close();
  engine.next();
  await until(() => a.last().phase === "question" && a.last().round === 1);
  await until(() => engine.state.players.pb?.online === false, 7000);
  const q2 = a.last().question!;
  a.t.send("answer", { questionId: q2.id, choice: 1, ms: 100 });
  engine.answer({ playerId: "host", questionId: q2.id, choice: 2, ms: 100 });
  await until(() => a.last().phase === "reveal");
  engine.next();
  await until(() => a.last().phase === "final");
  const final = a.last();
  assert.ok(final.players.host.score > final.players.pa.score);

  engine.dispose();
  a.t.close();
  ht.close();
});
