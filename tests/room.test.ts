import { test } from "node:test";
import assert from "node:assert/strict";
import { isUrgent, nextHost, Room, shouldAccept, StateSender } from "../src/lib/room.ts";
import { openDeck, sealDeck } from "../src/lib/deck.ts";
import { createTransport, hasSupabase } from "../src/lib/transport.ts";
import type { GameState, HostQuestion } from "../src/lib/types.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000, what = "condition") {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await wait(15);
  }
}

const st = (p: Partial<GameState>): GameState =>
  ({ version: 1, epoch: 1, hostId: "a", phase: "lobby", settings: {} as never, players: {}, round: 0, totalRounds: 0, answered: [], ...p }) as GameState;

test("nextHost: lowest remaining id, never the old host", () => {
  const m = (...ids: string[]) => ids.map((id) => ({ id, name: id }));
  assert.equal(nextHost(m("c", "a", "b"), "a"), "b");
  assert.equal(nextHost(m("c", "b"), "a"), "b");
  assert.equal(nextHost(m("a"), "a"), null);
});

test("shouldAccept: only the host's own messages, higher epoch wins, ties to the lower id, no stale versions", () => {
  const cur = st({ hostId: "b", epoch: 2, version: 10 });
  assert.equal(shouldAccept(null, st({ hostId: "a" }), "a"), true);
  assert.equal(shouldAccept(cur, st({ hostId: "a", epoch: 3 }), "x"), false, "sender must be the host it names");
  assert.equal(shouldAccept(cur, st({ hostId: "a", epoch: 1, version: 99 }), "a"), false, "old host after takeover");
  assert.equal(shouldAccept(cur, st({ hostId: "c", epoch: 3, version: 1 }), "c"), true);
  assert.equal(shouldAccept(cur, st({ hostId: "a", epoch: 2, version: 1 }), "a"), true, "tie: lower id wins");
  assert.equal(shouldAccept(cur, st({ hostId: "c", epoch: 2, version: 50 }), "c"), false, "tie: higher id loses");
  assert.equal(shouldAccept(cur, st({ hostId: "b", epoch: 2, version: 9 }), "b"), false, "stale");
  assert.equal(shouldAccept(cur, st({ hostId: "b", epoch: 2, version: 11 }), "b"), true);
});

test("isUrgent: phase/question/host changes go now, answer counts can wait", () => {
  const a = st({ phase: "question", question: { id: "q1" } as never });
  assert.equal(isUrgent(null, a), true);
  assert.equal(isUrgent(a, { ...a, answered: ["x"], version: 2 }), false);
  assert.equal(isUrgent(a, { ...a, phase: "reveal" }), true);
  assert.equal(isUrgent(a, { ...a, question: { id: "q2" } as never }), true);
  assert.equal(isUrgent(a, { ...a, epoch: 2 }), true);
});

test("StateSender batches non-urgent updates into one send per interval", async () => {
  const sent: GameState[] = [];
  const s = new StateSender((x) => sent.push(x), 60);
  const base = st({ phase: "question", question: { id: "q1" } as never });
  s.push(base);
  for (let i = 2; i <= 10; i++) s.push({ ...base, version: i, answered: Array(i).fill("p") });
  assert.equal(sent.length, 1, "first goes at once");
  await wait(90);
  assert.equal(sent.length, 2, "nine answer updates became one message");
  assert.equal(sent[1].version, 10, "and it carries the latest state");
  s.push({ ...base, phase: "reveal", version: 11 });
  assert.equal(sent.length, 3, "reveal is sent immediately");
  s.cancel();
});

test("deck: round trip, and tampering is rejected", () => {
  const qs = [{ id: "q0", answer: 2 }] as unknown as HostQuestion[];
  const { deck, deckId } = sealDeck(qs);
  assert.ok(!deck.includes('"answer"'), "answers are not readable in the sealed deck");
  assert.deepEqual(openDeck(deck), { deckId, questions: qs });
  const parts = deck.split(".");
  assert.throws(() => openDeck([parts[0], parts[1], parts[2], parts[3].slice(0, -2) + "AA"].join(".")));
  assert.throws(() => openDeck(["ffffffffffffffff", ...parts.slice(1)].join(".")), "deck id is bound to the contents");
});

// ---------------------------------------------------------------------------
// End to end over the in-browser transport: the host drops out mid-question.

function questions(n: number): HostQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    startAt: 0,
    answer: 1,
    track: { id: `t${i}`, title: `เพลง ${i}`, rawTitle: `เพลง ${i}`, artist: "ศิลปิน", previewUrl: `https://x/${i}.m4a` },
    choices: [0, 1, 2, 3].map((c) => ({ title: `ตัวเลือก ${i}-${c}`, artist: "ศิลปิน" })),
  }));
}

function kv() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v), remove: (k: string) => void m.delete(k), m };
}

const alive = new Set<Room>();
test.afterEach(() => {
  for (const r of alive) r.dispose();
  alive.clear();
});

function makeRoom(code: string, id: string, name: string, isCreator: boolean, storage = kv()) {
  const me = { id, name, color: "#ff5fa2" };
  const room = new Room({
    code,
    me,
    isCreator,
    transport: createTransport(code, me),
    storage,
    fetchQuestions: async () => {
      const qs = questions(3);
      return { questions: qs, warnings: [], ...sealDeck(qs) };
    },
    openDeck: async (deck) => openDeck(deck).questions,
    timing: { takeoverMs: 300, joinWaitMs: 300, sendEveryMs: 40, helloEveryMs: 200, noHostAfterMs: 3000 },
  });
  alive.add(room);
  return { room, storage };
}

test("host drops mid-question: next player takes over, same songs, scores kept, old host rejoins as a player", async () => {
  assert.equal(hasSupabase, false);
  const code = "T" + Math.random().toString(36).slice(2, 7);
  const A = makeRoom(code, "pa", "เอ", true);
  const B = makeRoom(code, "pb", "บี", false);
  const C = makeRoom(code, "pc", "ซี", false);
  await A.room.start();
  await Promise.all([B.room.start(), C.room.start()]);
  const s = (r: Room) => r.snapshot.state!;
  await until(() => !!C.room.snapshot.state && Object.keys(s(C.room).players).length === 3, 5000, "everyone joined");
  assert.equal(A.room.snapshot.amHost, true);
  assert.equal(B.room.snapshot.amHost, false);

  // Question 1 is played normally.
  A.room.host.start();
  await until(() => s(C.room)?.phase === "question", 5000, "q1");
  let q = s(B.room).question!;
  B.room.answer(q.id, 1, 1000);
  C.room.answer(q.id, 1, 2000);
  A.room.answer(q.id, 0, 500);
  await until(() => s(C.room).phase === "reveal", 5000, "reveal 1");
  const scoreB = s(C.room).players.pb.score;
  const scoreC = s(C.room).players.pc.score;
  assert.ok(scoreB > 0 && scoreC > 0);
  A.room.host.next();
  A.room.host.next();
  await until(() => s(C.room).phase === "question" && s(C.room).round === 1, 5000, "q2");

  // B answers q2, then the host vanishes.
  q = s(B.room).question!;
  B.room.answer(q.id, 1, 500);
  await wait(100);
  A.room.dispose();

  await until(() => B.room.snapshot.amHost, 5000, "B takes over");
  await until(() => s(C.room).hostId === "pb" && s(C.room).phase === "question", 5000, "C follows B");
  assert.equal(s(C.room).epoch, 2);
  assert.equal(s(C.room).round, 1, "same round");
  assert.equal(s(C.room).question!.id, "q1~2", "question is asked again with a fresh id");
  assert.equal(s(C.room).question!.choices[0].title, "ตัวเลือก 1-0", "same song as before");
  assert.equal(s(C.room).players.pb.score, scoreB, "scores carried over");
  assert.equal(s(C.room).players.pc.score, scoreC);
  assert.equal(s(C.room).players.pa.online, false);
  assert.equal(C.room.snapshot.hostChange?.name, "บี");
  assert.equal(B.room.snapshot.hostChange?.me, true);

  // Old answer to the first attempt is ignored; answers to the new attempt count.
  B.room.answer(q.id, 1, 100);
  assert.deepEqual(s(B.room).answered, []);
  q = s(C.room).question!;
  B.room.answer(q.id, 1, 300);
  C.room.answer(q.id, 2, 300);
  await until(() => s(C.room).phase === "reveal", 5000, "reveal 2 under new host");
  assert.ok(s(C.room).players.pb.score > scoreB);
  assert.equal(s(C.room).players.pc.score, scoreC);

  // The old host comes back (same browser tab storage) and joins as a normal player.
  const A2 = makeRoom(code, "pa", "เอ", true, A.storage);
  await A2.room.start();
  await until(() => !!A2.room.snapshot.state, 5000, "A2 gets state");
  await wait(400);
  assert.equal(A2.room.snapshot.amHost, false);
  assert.equal(s(A2.room).hostId, "pb");
  assert.equal(A.storage.m.has(`tsq:snap:${code}`), false, "stale host snapshot cleared");
  await until(() => s(C.room).players.pa.online === true, 5000, "A back online as a player");

  // Finish the game under the new host.
  B.room.host.next();
  B.room.host.next();
  await until(() => s(A2.room).phase === "question" && s(A2.room).round === 2, 5000, "q3");
  q = s(A2.room).question!;
  for (const r of [A2.room, B.room, C.room]) r.answer(q.id, 1, 100);
  await until(() => s(C.room).phase === "reveal", 5000, "reveal 3");
  B.room.host.next();
  await until(() => s(A2.room).phase === "final", 5000, "final");

  for (const r of [A2.room, B.room, C.room]) r.dispose();
});

test("host refreshes the page: keeps the host role and the game", async () => {
  const code = "R" + Math.random().toString(36).slice(2, 7);
  const A = makeRoom(code, "pa", "เอ", true);
  const B = makeRoom(code, "pb", "บี", false);
  await A.room.start();
  await B.room.start();
  await until(() => !!B.room.snapshot.state && Object.keys(B.room.snapshot.state.players).length === 2, 5000, "joined");
  A.room.host.start();
  await until(() => B.room.snapshot.state?.phase === "question", 5000, "q1");
  A.room.dispose();
  const A2 = makeRoom(code, "pa", "เอ", true, A.storage); // same tab storage
  await A2.room.start();
  await until(() => A2.room.snapshot.amHost, 5000, "A2 resumes as host");
  await wait(500);
  assert.equal(B.room.snapshot.amHost, false, "B did not take over during a quick refresh");
  assert.equal(B.room.snapshot.state!.epoch, 1);
  assert.equal(B.room.snapshot.state!.hostId, "pa");
  A2.room.dispose();
  B.room.dispose();
});

// A transport whose member list we control, to test presence lagging behind messages.
function fakeNet() {
  const nodes = new Set<FakeT>();
  class FakeT {
    kind = "local" as const;
    me: { id: string; name: string };
    handlers = new Map<string, Set<(d: unknown, from: string) => void>>();
    memberCbs = new Set<(m: { id: string; name: string }[]) => void>();
    inbox = false;
    constructor(me: { id: string; name: string }) {
      this.me = me;
    }
    async connect() {
      nodes.add(this);
    }
    deliver(type: string, data: unknown, from: string, toHostOnly: boolean) {
      for (const n of nodes) if (n !== this && (!toHostOnly || n.inbox)) n.handlers.get(type)?.forEach((h) => h(data, from));
    }
    send(type: string, data: unknown) {
      this.deliver(type, data, this.me.id, false);
    }
    sendToHost(type: string, data: unknown) {
      this.deliver(type, data, this.me.id, true);
    }
    openInbox() {
      this.inbox = true;
    }
    closeInbox() {
      this.inbox = false;
    }
    on(type: string, cb: (d: unknown, from: string) => void) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type)!.add(cb);
      return () => void this.handlers.get(type)?.delete(cb);
    }
    onMembers(cb: (m: { id: string; name: string }[]) => void) {
      this.memberCbs.add(cb);
      return () => void this.memberCbs.delete(cb);
    }
    setMembers(m: { id: string; name: string }[]) {
      this.memberCbs.forEach((cb) => cb(m));
    }
    close() {
      nodes.delete(this);
    }
  }
  return FakeT;
}

test("presence lagging behind: hearing from the host prevents a takeover; silence plus absence triggers one", async () => {
  const FakeT = fakeNet();
  const mk = (id: string, creator: boolean) => {
    const t = new FakeT({ id, name: id });
    const room = new Room({
      code: "F",
      me: { id, name: id },
      isCreator: creator,
      transport: t as never,
      fetchQuestions: async () => ({ questions: [], warnings: [] }),
      openDeck: async () => [],
      timing: { takeoverMs: 200, joinWaitMs: 100, sendEveryMs: 20, helloEveryMs: 50, noHostAfterMs: 3000 },
    });
    alive.add(room);
    return { room, t };
  };
  const A = mk("pa", true);
  const B = mk("pb", false);
  await A.room.start();
  await B.room.start();
  await until(() => !!B.room.snapshot.state, 2000, "B gets state");
  // B's member list never shows A, but A keeps sending state: no takeover.
  B.t.setMembers([{ id: "pb", name: "pb" }]);
  A.t.setMembers([{ id: "pa", name: "pa" }, { id: "pb", name: "pb" }]);
  for (let i = 0; i < 8; i++) {
    A.room.host.updateSettings({ ...A.room.snapshot.state!.settings, rounds: 5 + (i % 2) * 5 });
    await wait(60);
  }
  assert.equal(B.room.snapshot.amHost, false, "no takeover while the host is still talking");
  // A goes silent too: now B takes over.
  A.t.close();
  await until(() => B.room.snapshot.amHost, 2000, "takeover after silence");
  assert.equal(B.room.snapshot.state!.epoch, 2);
});
