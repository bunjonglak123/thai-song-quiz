// Connection to the Go game server (songquiz-server). The server runs the game;
// this client only sends intents and shows the state it receives.

import type { GameSettings, GameState, Member } from "./types.ts";

/** Settings compare by value; key order can differ after the round trip through Go. */
function sameSettings(a: GameSettings, b: GameSettings) {
  const norm = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, norm(x)]))
      : Array.isArray(v)
        ? v.map(norm)
        : v;
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export type ConnStatus = "connecting" | "waking" | "ok" | "error" | "no-host";

export type SocketView = { state: GameState | null; status: ConnStatus; amHost: boolean };

type Timers = { set(fn: () => void, ms: number): unknown; clear(h: unknown): void };

export const GAME_SERVER_URL = (process.env.NEXT_PUBLIC_GAME_SERVER_URL ?? "").replace(/\/+$/, "");

const WAKING_AFTER_MS = 3000;
const PING_EVERY_MS = 20000;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 5000;

// Close codes from the server: no retry for these.
const CLOSE_NOT_FOUND = 4404;
const CLOSE_REPLACED = 4409;
const CLOSE_FULL = 4429;

export class GameSocket {
  private o: { url: string; code: string; me: Member; create: boolean };
  private WS: typeof WebSocket;
  private timers: Timers;
  private ws: WebSocket | null = null;
  private view: SocketView = { state: null, status: "connecting", amHost: false };
  private subs = new Set<(v: SocketView) => void>();
  private attempts = 0;
  private retryTimer: unknown = null;
  private wakeTimer: unknown = null;
  private pingTimer: unknown = null;
  private closed = false;
  private pendingSettings: GameSettings | null = null;

  constructor(o: { url: string; code: string; me: Member; create: boolean; WS?: typeof WebSocket; timers?: Timers }) {
    this.o = o;
    this.WS = o.WS ?? WebSocket;
    this.timers = o.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
  }

  get snapshot() {
    return this.view;
  }

  subscribe(cb: (v: SocketView) => void) {
    this.subs.add(cb);
    return () => void this.subs.delete(cb);
  }

  socketUrl() {
    const { url, code, me, create } = this.o;
    const u = new URL(`${url.replace(/^http/, "ws")}/ws/rooms/${encodeURIComponent(code)}`);
    u.searchParams.set("pid", me.id);
    u.searchParams.set("name", me.name);
    if (me.color) u.searchParams.set("color", me.color);
    if (create) u.searchParams.set("create", "1");
    return u.toString();
  }

  connect() {
    if (this.closed) return;
    const ws = new this.WS(this.socketUrl());
    this.ws = ws;
    this.timers.clear(this.wakeTimer);
    this.wakeTimer = this.timers.set(() => {
      if (this.ws === ws && ws.readyState !== 1) this.set({ status: "waking" });
    }, WAKING_AFTER_MS);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.timers.clear(this.wakeTimer);
      this.set({ status: "ok" });
      this.ping();
    };
    ws.onmessage = (e: MessageEvent) => {
      if (this.ws !== ws) return;
      let msg: { type?: string; data?: unknown };
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg.type === "state") this.onState(msg.data as GameState);
    };
    ws.onclose = (e: CloseEvent) => {
      if (this.ws !== ws) return;
      this.timers.clear(this.pingTimer);
      this.timers.clear(this.wakeTimer);
      this.ws = null;
      if (this.closed) return;
      if (e.code === CLOSE_NOT_FOUND) return this.set({ status: "no-host" });
      if (e.code === CLOSE_REPLACED || e.code === CLOSE_FULL) return this.set({ status: "error" });
      const delay = Math.min(BACKOFF_START_MS * 2 ** this.attempts, BACKOFF_MAX_MS);
      this.attempts++;
      if (this.view.status !== "waking") this.set({ status: "connecting" });
      this.retryTimer = this.timers.set(() => this.connect(), delay);
    };
  }

  /** Sends a frame if connected. Returns false when it couldn't be sent. */
  send(type: string, data?: unknown) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(data === undefined ? { type } : { type, data }));
    return true;
  }

  /**
   * Host settings change. Shown at once and kept over older server states until the
   * server echoes it, so a second quick click builds on the first instead of undoing it.
   */
  updateSettings(s: GameSettings) {
    if (!this.send("settings", s)) return;
    this.pendingSettings = s;
    if (this.view.state) this.set({ state: { ...this.view.state, settings: s } });
  }

  close() {
    this.closed = true;
    this.timers.clear(this.retryTimer);
    this.timers.clear(this.pingTimer);
    this.timers.clear(this.wakeTimer);
    this.ws?.close();
  }

  private ping() {
    this.pingTimer = this.timers.set(() => {
      this.send("ping");
      this.ping();
    }, PING_EVERY_MS);
  }

  private onState(s: GameState) {
    const cur = this.view.state;
    if (cur && s.version <= cur.version && s.hostId === cur.hostId) return;
    const pending = this.pendingSettings;
    if (pending) {
      if (s.phase !== "lobby" || sameSettings(s.settings, pending)) this.pendingSettings = null;
      else s = { ...s, settings: pending };
    }
    this.set({ state: s, status: "ok", amHost: s.hostId === this.o.me.id });
  }

  private set(patch: Partial<SocketView>) {
    this.view = { ...this.view, ...patch };
    this.subs.forEach((cb) => cb(this.view));
  }
}
