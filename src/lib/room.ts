// Room controller: everything a player's browser does in a room, without React.
//  - join: ask who the host is, or become host (new room / host refreshing the page)
//  - host: run the HostEngine, broadcast state in batches, receive answers in a private inbox
//  - player: accept state only from the current host, send answers to the host's inbox
//  - takeover: if the host is gone for TAKEOVER_MS, the first remaining player (by id)
//    becomes host, re-opens the sealed question deck and carries on the same game

import { HostEngine, type HostSnapshot } from "./host-engine.ts";
import type { Member, RoomTransport } from "./transport.ts";
import type { GameSettings, GameState, HostQuestion } from "./types.ts";

export type ConnStatus = "connecting" | "ok" | "error" | "no-host";

export type HostChange = { name: string; me: boolean; at: number };

export type RoomView = {
  state: GameState | null;
  members: Member[];
  status: ConnStatus;
  amHost: boolean;
  /** Set when the host role just moved; the UI shows it for a few seconds. */
  hostChange: HostChange | null;
};

export type FetchedQuestions = { questions: HostQuestion[]; warnings: string[]; deck?: string; deckId?: string };

export type RoomDeps = {
  code: string;
  me: Member;
  /** This browser created the room (and hasn't lost the host role since). */
  isCreator: boolean;
  transport: RoomTransport;
  fetchQuestions: (s: GameSettings) => Promise<FetchedQuestions>;
  openDeck: (deck: string) => Promise<HostQuestion[]>;
  storage?: KV;
  timing?: Partial<typeof DEFAULT_TIMING>;
};

type KV = { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void };

export const DEFAULT_TIMING = {
  /** How long the host may be missing before someone takes over. Covers a page refresh. */
  takeoverMs: 6000,
  /** A host's own refresh: how long to wait for someone to say the role has moved. */
  joinWaitMs: 1500,
  /** Batch state broadcasts: at most one per this many ms (urgent changes go immediately). */
  sendEveryMs: 700,
  helloEveryMs: 2000,
  noHostAfterMs: 8000,
};

/** The player who takes over: lowest id among those still here (everyone computes the same). */
export function nextHost(members: Member[], oldHostId: string): string | null {
  const ids = members.map((m) => m.id).filter((id) => id !== oldHostId).sort();
  return ids[0] ?? null;
}

/** Only the current host's newest state counts. Higher epoch wins; a tie goes to the lower host id. */
export function shouldAccept(cur: GameState | null, next: GameState, from: string): boolean {
  if (!next || from !== next.hostId) return false;
  if (!cur) return true;
  const ce = cur.epoch ?? 1;
  const ne = next.epoch ?? 1;
  if (ne !== ce) return ne > ce;
  if (next.hostId !== cur.hostId) return next.hostId < cur.hostId;
  return next.version >= cur.version;
}

/** Changes everyone should see at once; anything else is batched. */
export function isUrgent(prev: GameState | null, next: GameState): boolean {
  if (!prev) return true;
  return (
    prev.phase !== next.phase ||
    prev.round !== next.round ||
    prev.question?.id !== next.question?.id ||
    prev.hostId !== next.hostId ||
    prev.epoch !== next.epoch ||
    prev.error !== next.error
  );
}

/** Coalesces state broadcasts: urgent ones go now, the rest at most once per interval. */
export class StateSender {
  private last: GameState | null = null;
  private pending: GameState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private send: (s: GameState) => void;
  private every: number;
  constructor(send: (s: GameState) => void, everyMs: number) {
    this.send = send;
    this.every = everyMs;
  }
  push(s: GameState) {
    if (isUrgent(this.last, s)) {
      this.flushNow(s);
      return;
    }
    this.pending = s;
    if (!this.timer) this.timer = setTimeout(() => this.flushNow(this.pending), this.every);
  }
  flushNow(s: GameState | null) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    if (!s) return;
    this.last = s;
    this.send(s);
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}

const memoryKV = (): KV => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

export class Room {
  private d: RoomDeps;
  private t: RoomTransport;
  private kv: KV;
  private timing: typeof DEFAULT_TIMING;
  private view: RoomView = { state: null, members: [], status: "connecting", amHost: false, hostChange: null };
  private listeners = new Set<(v: RoomView) => void>();
  private engine: HostEngine | null = null;
  private sender: StateSender;
  private deck: { id: string; blob: string } | null = null;
  private offs: (() => void)[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private helloTimer: ReturnType<typeof setInterval> | null = null;
  private takeoverTimer: ReturnType<typeof setTimeout> | null = null;
  private takingOver = false;
  /** Last time a message from the host arrived: proof it's alive even before presence catches up. */
  private heardHostAt = 0;
  private disposed = false;

  constructor(deps: RoomDeps) {
    this.d = deps;
    this.t = deps.transport;
    this.kv = deps.storage ?? memoryKV();
    this.timing = { ...DEFAULT_TIMING, ...deps.timing };
    this.sender = new StateSender((s) => this.t.send("state", s), this.timing.sendEveryMs);
  }

  // ---- public API -------------------------------------------------------

  get snapshot() {
    return this.view;
  }

  subscribe(cb: (v: RoomView) => void) {
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  }

  async start() {
    const t = this.t;
    this.offs.push(
      t.on("state", (d, from) => this.onState(d as GameState, from)),
      t.on("deck", (d) => {
        const deck = d as { id?: string; blob?: string };
        if (deck?.id && deck.blob) this.deck = { id: deck.id, blob: deck.blob };
      }),
      t.on("hello", () => this.onHello()),
      t.on("answer", (d, from) => {
        const a = d as { questionId: string; choice: number; ms: number };
        this.engine?.answer({ playerId: from, questionId: a.questionId, choice: a.choice, ms: a.ms });
      }),
      t.onMembers((m) => {
        this.set({ members: m });
        this.engine?.syncMembers(m);
        this.watchHost();
      }),
    );

    try {
      await t.connect();
    } catch {
      this.set({ status: "error" });
      return;
    }
    if (this.disposed) return;

    const snap = this.readSnap();
    if (this.d.isCreator && !snap) {
      this.becomeHost(null); // brand-new room
      return;
    }
    // Otherwise find out who's host. A refreshing host waits briefly in case the role has moved.
    const hello = () => t.sendToHost("hello", null);
    hello();
    this.helloTimer = setInterval(() => (this.view.state ? this.stopHello() : hello()), this.timing.helloEveryMs);
    this.later(() => {
      if (!this.view.state && !this.engine && snap && snap.state.hostId === this.d.me.id) this.becomeHost(snap);
    }, this.timing.joinWaitMs);
    this.later(() => {
      if (!this.view.state && !this.engine) this.set({ status: "no-host" });
    }, this.timing.noHostAfterMs);
  }

  answer(questionId: string, choice: number, ms: number) {
    if (this.engine) this.engine.answer({ playerId: this.d.me.id, questionId, choice, ms });
    else this.t.sendToHost("answer", { questionId, choice, ms });
  }

  readonly host = {
    updateSettings: (s: GameSettings) => this.engine?.updateSettings(s),
    start: () => void this.engine?.start(),
    next: () => this.engine?.next(),
    revealNow: () => this.engine?.reveal(),
    backToLobby: () => this.engine?.backToLobby(),
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.offs.forEach((f) => f());
    this.stopHello();
    for (const h of this.timers) clearTimeout(h);
    if (this.takeoverTimer) clearTimeout(this.takeoverTimer);
    this.sender.cancel();
    this.engine?.dispose();
    this.engine = null;
    this.t.close();
  }

  // ---- internals --------------------------------------------------------

  private set(patch: Partial<RoomView>) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((cb) => cb(this.view));
  }

  private later(fn: () => void, ms: number) {
    const h = setTimeout(() => {
      this.timers.delete(h);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(h);
  }

  private stopHello() {
    if (this.helloTimer) clearInterval(this.helloTimer);
    this.helloTimer = null;
  }

  private snapKey() {
    return `tsq:snap:${this.d.code}`;
  }
  private readSnap(): HostSnapshot | null {
    try {
      const raw = this.kv.get(this.snapKey());
      return raw ? (JSON.parse(raw) as HostSnapshot) : null;
    } catch {
      return null;
    }
  }

  private noteHostChange(prev: GameState | null, next: GameState) {
    if (!prev || prev.hostId === next.hostId) return;
    const me = next.hostId === this.d.me.id;
    this.set({ hostChange: { name: next.players[next.hostId]?.name ?? "?", me, at: Date.now() } });
  }

  private onState(s: GameState, from: string) {
    const cur = this.view.state;
    if (!shouldAccept(cur, s, from)) return;
    if (this.engine && s.hostId !== this.d.me.id) this.demote(); // someone else took over
    this.heardHostAt = Date.now();
    this.stopHello();
    if (s.hostId !== this.d.me.id && !this.engine) {
      // I'm not host (any more): forget any old host snapshot so a refresh can't revive it.
      this.kv.remove(this.snapKey());
      this.kv.remove(`tsq:host:${this.d.code}`);
    }
    this.noteHostChange(cur, s);
    this.set({ state: s, status: "ok" });
    this.watchHost();
    // Others still think I'm host (e.g. I refreshed): pick the game back up.
    if (s.hostId === this.d.me.id && !this.engine) {
      const snap = this.readSnap();
      if (snap && (snap.state.epoch ?? 1) === (s.epoch ?? 1)) this.becomeHost(snap);
      else void this.takeOver(s);
    }
  }

  private onHello() {
    if (!this.engine) return;
    this.sender.flushNow(this.engine.state);
    if (this.deck && this.engine.state.phase !== "lobby") this.t.send("deck", this.deck);
  }

  /** Start the takeover countdown while the host is missing from the room. */
  private watchHost() {
    const s = this.view.state;
    const inRoom = !s || this.engine || this.view.members.some((m) => m.id === s.hostId);
    if (inRoom) {
      if (this.takeoverTimer) clearTimeout(this.takeoverTimer);
      this.takeoverTimer = null;
      return;
    }
    if (this.takeoverTimer) return;
    this.takeoverTimer = setTimeout(() => {
      this.takeoverTimer = null;
      const st = this.view.state;
      if (this.disposed || !st || this.engine) return;
      if (this.hostSeen(st)) return void this.watchHost(); // back in the room, or still sending us state
      if (nextHost(this.view.members, st.hostId) === this.d.me.id) void this.takeOver(st);
      else this.watchHost(); // someone else should take over; keep watching in case they don't
    }, this.timing.takeoverMs);
  }

  private hostSeen(s: GameState) {
    return this.view.members.some((m) => m.id === s.hostId) || Date.now() - this.heardHostAt < this.timing.takeoverMs;
  }

  private async takeOver(from: GameState) {
    if (this.takingOver || this.engine) return;
    this.takingOver = true;
    try {
      let questions: HostQuestion[] = [];
      const midGame = from.phase === "question" || from.phase === "reveal" || from.phase === "standings";
      if (midGame && this.deck && this.deck.id === from.deckId) {
        try {
          questions = await this.d.openDeck(this.deck.blob);
        } catch {
          questions = [];
        }
      }
      if (this.disposed || this.engine) return;
      // Someone else may have taken over while the deck was opening.
      const now = this.view.state;
      if (now && (now.epoch ?? 1) > (from.epoch ?? 1)) return;
      this.becomeHost({ state: now ?? from, questions, picks: {} }, true);
    } finally {
      this.takingOver = false;
    }
  }

  private becomeHost(snap: HostSnapshot | null, takeover = false) {
    const me = this.d.me;
    this.stopHello();
    this.t.openInbox();
    const engine = new HostEngine(
      {
        hostId: me.id,
        hostName: me.name,
        hostColor: me.color,
        onChange: (s) => {
          const prev = this.view.state;
          this.noteHostChange(prev, s);
          this.set({ state: s, status: "ok", amHost: true });
          this.sender.push(s);
        },
        persist: (snapshot) => {
          try {
            this.kv.set(this.snapKey(), JSON.stringify(snapshot));
          } catch {}
        },
        fetchQuestions: async (settings) => {
          const r = await this.d.fetchQuestions(settings);
          if (r.deck && r.deckId) {
            this.deck = { id: r.deckId, blob: r.deck };
            this.t.send("deck", this.deck);
          }
          return { questions: r.questions, warnings: r.warnings, deckId: r.deckId };
        },
      },
      snap,
      { takeover },
    );
    this.engine = engine;
    this.kv.set(`tsq:host:${this.d.code}`, "1");
    engine.syncMembers(this.view.members);
    this.set({ state: engine.state, status: "ok", amHost: true });
    this.sender.flushNow(engine.state);
    if (this.deck && engine.state.phase !== "lobby") this.t.send("deck", this.deck);
    this.watchHost();
  }

  private demote() {
    this.engine?.dispose();
    this.engine = null;
    this.sender.cancel();
    this.t.closeInbox();
    this.kv.remove(this.snapKey());
    this.kv.remove(`tsq:host:${this.d.code}`);
    this.set({ amHost: false });
  }
}
