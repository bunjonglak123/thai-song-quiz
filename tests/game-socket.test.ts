// GameSocket: the browser's connection to the Go game server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GameSocket, type SocketView } from "../src/lib/game-socket.ts";

class FakeWS {
  static all: FakeWS[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeWS.all.push(this);
  }
  send(s: string) {
    this.sent.push(s);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  state(s: object) {
    this.onmessage?.({ data: JSON.stringify({ type: "state", data: s }) });
  }
}

type Timer = { fn: () => void; ms: number; cleared: boolean };
function fakeTimers() {
  const list: Timer[] = [];
  return {
    list,
    set(fn: () => void, ms: number) {
      const t = { fn, ms, cleared: false };
      list.push(t);
      return t;
    },
    clear(h: unknown) {
      if (h) (h as Timer).cleared = true;
    },
    /** Fire the newest live timer with this delay. */
    fire(ms: number) {
      const t = [...list].reverse().find((x) => x.ms === ms && !x.cleared);
      assert.ok(t, `no live ${ms}ms timer (have ${list.filter((x) => !x.cleared).map((x) => x.ms)})`);
      t.cleared = true;
      t.fn();
    },
    live(ms: number) {
      return list.filter((x) => x.ms === ms && !x.cleared).length;
    },
  };
}

const me = { id: "pid-aaaa1111", name: "แบงค์ ทดสอบ", color: "#112233" };

function setup(create = true) {
  FakeWS.all = [];
  const timers = fakeTimers();
  const s = new GameSocket({ url: "https://game.example", code: "ABC12", me, create, WS: FakeWS as unknown as typeof WebSocket, timers });
  const views: SocketView[] = [];
  s.subscribe((v) => views.push(v));
  s.connect();
  return { s, timers, views, last: () => views[views.length - 1], ws: () => FakeWS.all[FakeWS.all.length - 1] };
}

const st = (version: number, hostId = "pid-aaaa1111") => ({ version, hostId, phase: "lobby", players: {}, answered: [] });

test("builds the socket URL with create only for the creator", () => {
  const a = setup(true);
  const u = new URL(a.ws().url);
  assert.equal(u.protocol, "wss:");
  assert.equal(u.pathname, "/ws/rooms/ABC12");
  assert.equal(u.searchParams.get("pid"), me.id);
  assert.equal(u.searchParams.get("name"), me.name);
  assert.equal(u.searchParams.get("color"), me.color);
  assert.equal(u.searchParams.get("create"), "1");
  const b = setup(false);
  assert.equal(new URL(b.ws().url).searchParams.has("create"), false);
});

test("reconnects with backoff and keeps pid", () => {
  const { timers, ws, last } = setup();
  ws().drop(1006);
  assert.equal(last().status, "connecting");
  timers.fire(500);
  ws().drop(1006);
  timers.fire(1000);
  ws().drop(1006);
  timers.fire(2000);
  assert.equal(FakeWS.all.length, 4);
  for (const w of FakeWS.all) assert.equal(new URL(w.url).searchParams.get("pid"), me.id);
  ws().open();
  ws().drop(1006);
  assert.equal(timers.live(500), 1, "backoff resets after a successful open");
});

test("backoff is capped at 5 seconds", () => {
  const { timers, ws } = setup();
  for (const ms of [500, 1000, 2000, 4000, 5000, 5000]) {
    ws().drop(1006);
    timers.fire(ms);
  }
});

test("4404 means no-host and stops retrying", () => {
  const { timers, ws, last } = setup(false);
  ws().drop(4404);
  assert.equal(last().status, "no-host");
  assert.equal(timers.list.filter((t) => !t.cleared && t.ms <= 5000 && t.ms >= 500).length, 0);
});

test("4409 (opened in another tab) is an error without retry", () => {
  const { ws, last, timers } = setup();
  ws().drop(4409);
  assert.equal(last().status, "error");
  assert.equal(timers.live(500), 0);
});

test("ignores older state versions", () => {
  const { ws, last } = setup();
  ws().open();
  ws().state(st(5));
  ws().state(st(3));
  assert.equal(last().state?.version, 5);
  ws().state(st(6));
  assert.equal(last().state?.version, 6);
  assert.equal(last().status, "ok");
});

test("amHost follows hostId", () => {
  const { ws, last } = setup();
  ws().open();
  ws().state(st(1, "someone-else"));
  assert.equal(last().amHost, false);
  ws().state(st(2, me.id));
  assert.equal(last().amHost, true);
});

test("waking after 3s without open", () => {
  const { timers, ws, last } = setup();
  timers.fire(3000);
  assert.equal(last().status, "waking");
  ws().open();
  assert.equal(last().status, "ok");
});

test("send writes JSON frames only while open; pings every 20s", () => {
  const { s, ws, timers } = setup();
  assert.equal(s.send("answer", { choice: 1 }), false);
  ws().open();
  assert.equal(s.send("answer", { choice: 1 }), true);
  assert.deepEqual(JSON.parse(ws().sent[0]), { type: "answer", data: { choice: 1 } });
  timers.fire(20000);
  assert.deepEqual(JSON.parse(ws().sent[1]), { type: "ping" });
});

test("close stops reconnecting", () => {
  const { s, ws, timers } = setup();
  s.close();
  ws().drop(1006);
  assert.equal(timers.live(500), 0);
});
