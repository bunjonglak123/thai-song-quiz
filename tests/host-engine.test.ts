import { test } from "node:test";
import assert from "node:assert/strict";
import { HostEngine, REVEAL_MS, GRACE_MS, type HostSnapshot } from "../src/lib/host-engine.ts";
import type { GameState, HostQuestion } from "../src/lib/types.ts";

function q(i: number, answer = 1): HostQuestion {
  return {
    id: `q${i}`,
    startAt: 0,
    answer,
    track: { id: `t${i}`, title: `Song ${i}`, rawTitle: `Song ${i}`, artist: "A", previewUrl: `p${i}.m4a` },
    choices: [0, 1, 2, 3].map((c) => ({ title: `c${i}-${c}`, artist: "A" })),
  };
}

class FakeTimers {
  now = 0;
  private items: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  set = (fn: () => void, ms: number) => {
    const id = ++this.seq;
    this.items.push({ at: this.now + ms, fn, id });
    return id;
  };
  clear = (h: unknown) => {
    this.items = this.items.filter((x) => x.id !== h);
  };
  advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      this.items.sort((a, b) => a.at - b.at);
      const next = this.items[0];
      if (!next || next.at > end) break;
      this.items.shift();
      this.now = next.at;
      next.fn();
    }
    this.now = end;
  }
}

function setup(nq = 2) {
  const timers = new FakeTimers();
  const broadcasts: GameState[] = [];
  let snap: HostSnapshot | null = null;
  const eng = new HostEngine({
    hostId: "host",
    hostName: "โฮสต์",
    onChange: (s) => broadcasts.push(s),
    persist: (s) => (snap = structuredClone(s)),
    fetchQuestions: async () => ({ questions: Array.from({ length: nq }, (_, i) => q(i)), warnings: [] }),
    timers,
  });
  return { eng, timers, broadcasts, getSnap: () => snap };
}

test("full game: join, answer, early reveal, scores, final", async () => {
  const { eng, timers, broadcasts } = setup(2);
  eng.syncMembers([{ id: "host", name: "โฮสต์" }, { id: "p1", name: "มิ้นท์" }]);
  assert.deepEqual(Object.keys(eng.state.players).sort(), ["host", "p1"]);

  await eng.start();
  assert.equal(eng.state.phase, "question");
  assert.equal(eng.state.totalRounds, 2);
  // Public state must not leak the answer, nor the artist of any choice
  for (const b of broadcasts) {
    assert.ok(!JSON.stringify(b.question ?? {}).includes('"answer"'));
    if (b.phase === "question") {
      assert.equal(b.reveal, undefined);
      assert.ok(b.question!.choices.every((c) => c.artist === undefined));
      assert.equal(b.question!.lockMs, 3000);
    }
  }

  const qid = eng.state.question!.id;
  eng.answer({ playerId: "p1", questionId: qid, choice: 1, ms: 0 }); // correct, instant
  eng.answer({ playerId: "p1", questionId: qid, choice: 0, ms: 0 }); // duplicate ignored
  assert.equal(eng.state.phase, "question");
  eng.answer({ playerId: "host", questionId: qid, choice: 2, ms: 3000 }); // wrong
  timers.advance(700); // early reveal after everyone answered
  assert.equal(eng.state.phase, "reveal");
  assert.equal(eng.state.players.p1.score, 1000);
  assert.equal(eng.state.players.host.score, 0);
  assert.equal(eng.state.reveal!.answer, 1);
  assert.equal(eng.state.reveal!.picks.p1.gain, 1000);
  assert.equal(eng.state.reveal!.choices![1].artist, "A", "artists shown after the reveal");

  timers.advance(REVEAL_MS);
  assert.equal(eng.state.phase, "question");
  assert.equal(eng.state.round, 1);

  // Nobody answers: timeout reveal
  timers.advance(3000 + 15000 + GRACE_MS);
  assert.equal(eng.state.phase, "reveal");
  assert.equal(eng.state.players.p1.streak, 0);
  timers.advance(REVEAL_MS);
  assert.equal(eng.state.phase, "final");
});

test("rejects stale, out-of-range and unknown-player answers", async () => {
  const { eng } = setup(1);
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }]);
  await eng.start();
  const qid = eng.state.question!.id;
  eng.answer({ playerId: "p1", questionId: "old", choice: 1, ms: 0 });
  eng.answer({ playerId: "p1", questionId: qid, choice: 9, ms: 0 });
  eng.answer({ playerId: "ghost", questionId: qid, choice: 1, ms: 0 });
  assert.deepEqual(eng.state.answered, []);
});

test("player leaving mid-question doesn't block early reveal; leaving lobby removes them", async () => {
  const { eng, timers } = setup(1);
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }, { id: "p2", name: "b" }]);
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }]);
  assert.ok(!eng.state.players.p2, "removed in lobby");
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }, { id: "p2", name: "b" }]);
  await eng.start();
  const qid = eng.state.question!.id;
  eng.answer({ playerId: "host", questionId: qid, choice: 1, ms: 100 });
  eng.answer({ playerId: "p1", questionId: qid, choice: 1, ms: 100 });
  assert.equal(eng.state.phase, "question");
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }]); // p2 drops
  assert.equal(eng.state.players.p2.online, false);
  timers.advance(700);
  assert.equal(eng.state.phase, "reveal");
});

test("fetch failure returns to lobby with error", async () => {
  const eng = new HostEngine({
    hostId: "h",
    hostName: "h",
    onChange: () => {},
    fetchQuestions: async () => {
      throw new Error("ดึงชาร์ตไม่สำเร็จ");
    },
  });
  await eng.start();
  assert.equal(eng.state.phase, "lobby");
  assert.equal(eng.state.error, "ดึงชาร์ตไม่สำเร็จ");
});

test("host refresh resumes from snapshot", async () => {
  const { eng, getSnap } = setup(2);
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p1", name: "a" }]);
  await eng.start();
  eng.dispose();
  const timers = new FakeTimers();
  const eng2 = new HostEngine(
    { hostId: "host", hostName: "h", onChange: () => {}, fetchQuestions: async () => ({ questions: [], warnings: [] }), timers },
    getSnap(),
  );
  assert.equal(eng2.state.phase, "question");
  eng2.answer({ playerId: "p1", questionId: eng2.state.question!.id, choice: 1, ms: 0 });
  timers.advance(3000 + 15000 + GRACE_MS);
  assert.equal(eng2.state.phase, "reveal");
  assert.equal(eng2.state.players.p1.score, 1000);
});

test("listen time 0 means no lock; timeout is listen + answer time", async () => {
  const { eng, timers } = setup(1);
  eng.syncMembers([{ id: "host", name: "h" }, { id: "p", name: "p" }]);
  eng.updateSettings({ ...eng.state.settings, listenSeconds: 0, roundSeconds: 10 });
  await eng.start();
  assert.equal(eng.state.question!.lockMs, 0);
  timers.advance(10000 + GRACE_MS - 1);
  assert.equal(eng.state.phase, "question");
  timers.advance(1);
  assert.equal(eng.state.phase, "reveal");
});

test("play again resets scores", async () => {
  const { eng, timers } = setup(1);
  eng.syncMembers([{ id: "host", name: "h" }]);
  await eng.start();
  eng.answer({ playerId: "host", questionId: eng.state.question!.id, choice: 1, ms: 0 });
  timers.advance(700 + REVEAL_MS);
  assert.equal(eng.state.phase, "final");
  assert.equal(eng.state.players.host.score, 1000);
  await eng.start();
  assert.equal(eng.state.phase, "question");
  assert.equal(eng.state.players.host.score, 0);
});
