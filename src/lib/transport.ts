"use client";
// Realtime room transport.
//  - Supabase Realtime (broadcast + presence) when NEXT_PUBLIC_SUPABASE_URL/KEY are set
//  - Otherwise a BroadcastChannel fallback: works across tabs of ONE browser, for local testing

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

export type Member = { id: string; name: string };
type Msg = { type: string; from: string; data: unknown };
type Handler = (data: unknown, from: string) => void;

export interface RoomTransport {
  readonly kind: "supabase" | "local";
  connect(): Promise<void>;
  send(type: string, data: unknown): void; // goes to everyone else (not to self)
  on(type: string, cb: Handler): () => void;
  onMembers(cb: (m: Member[]) => void): () => void;
  close(): void;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

let client: SupabaseClient | null = null;
function supa() {
  if (!client) client = createClient(SUPABASE_URL!, SUPABASE_KEY!, { realtime: { params: { eventsPerSecond: 20 } } });
  return client;
}

export function createTransport(room: string, me: Member): RoomTransport {
  return hasSupabase ? new SupabaseTransport(room, me) : new LocalTransport(room, me);
}

abstract class Base {
  protected handlers = new Map<string, Set<Handler>>();
  protected memberCbs = new Set<(m: Member[]) => void>();
  protected members: Member[] = [];
  on(type: string, cb: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(cb);
    return () => void this.handlers.get(type)?.delete(cb);
  }
  onMembers(cb: (m: Member[]) => void) {
    this.memberCbs.add(cb);
    cb(this.members);
    return () => void this.memberCbs.delete(cb);
  }
  protected emit(msg: Msg) {
    this.handlers.get(msg.type)?.forEach((h) => h(msg.data, msg.from));
  }
  protected setMembers(m: Member[]) {
    m.sort((a, b) => a.id.localeCompare(b.id));
    const same = m.length === this.members.length && m.every((x, i) => x.id === this.members[i].id && x.name === this.members[i].name);
    if (same) return;
    this.members = m;
    this.memberCbs.forEach((cb) => cb(m));
  }
}

class SupabaseTransport extends Base implements RoomTransport {
  readonly kind = "supabase" as const;
  private ch: RealtimeChannel | null = null;
  private ready = false;
  private queue: Msg[] = [];
  private room: string;
  private me: Member;
  constructor(room: string, me: Member) {
    super();
    this.room = room;
    this.me = me;
  }
  connect() {
    return new Promise<void>((resolve, reject) => {
      const ch = supa().channel(`thai-song-quiz:${this.room}`, {
        config: { broadcast: { self: false }, presence: { key: this.me.id } },
      });
      this.ch = ch;
      ch.on("broadcast", { event: "msg" }, ({ payload }) => this.emit(payload as Msg));
      ch.on("presence", { event: "sync" }, () => {
        const st = ch.presenceState<{ name: string }>();
        this.setMembers(Object.entries(st).map(([id, metas]) => ({ id, name: metas[0]?.name ?? "?" })));
      });
      let settled = false;
      ch.subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          this.ready = true;
          await ch.track({ name: this.me.name });
          this.queue.splice(0).forEach((m) => this.push(m));
          if (!settled) {
            settled = true;
            resolve();
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.ready = false;
          if (!settled) {
            settled = true;
            reject(err ?? new Error(status));
          }
        }
      });
    });
  }
  private push(m: Msg) {
    void this.ch?.send({ type: "broadcast", event: "msg", payload: m });
  }
  send(type: string, data: unknown) {
    const m = { type, from: this.me.id, data };
    if (this.ready) this.push(m);
    else this.queue.push(m);
  }
  close() {
    if (this.ch) void supa().removeChannel(this.ch);
    this.ch = null;
  }
}

/** Same-browser fallback with a heartbeat-based presence. */
class LocalTransport extends Base implements RoomTransport {
  readonly kind = "local" as const;
  private bc: BroadcastChannel | null = null;
  private seen = new Map<string, { name: string; at: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private room: string;
  private me: Member;
  constructor(room: string, me: Member) {
    super();
    this.room = room;
    this.me = me;
  }
  async connect() {
    this.bc = new BroadcastChannel(`thai-song-quiz:${this.room}`);
    this.bc.onmessage = (e) => {
      const m = e.data as Msg;
      if (m.type === "__hb") {
        this.seen.set(m.from, { name: String(m.data), at: Date.now() });
        this.refresh();
      } else if (m.type === "__bye") {
        this.seen.delete(m.from);
        this.refresh();
      } else this.emit(m);
    };
    const beat = () => {
      this.seen.set(this.me.id, { name: this.me.name, at: Date.now() });
      this.bc?.postMessage({ type: "__hb", from: this.me.id, data: this.me.name });
      this.refresh();
    };
    beat();
    this.timer = setInterval(beat, 1500);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.bye);
  }
  private bye = () => this.bc?.postMessage({ type: "__bye", from: this.me.id, data: null });
  private refresh() {
    const now = Date.now();
    for (const [id, v] of this.seen) if (now - v.at > 5000) this.seen.delete(id);
    this.setMembers([...this.seen].map(([id, v]) => ({ id, name: v.name })));
  }
  send(type: string, data: unknown) {
    this.bc?.postMessage({ type, from: this.me.id, data });
  }
  close() {
    this.bye();
    if (this.timer) clearInterval(this.timer);
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.bye);
    this.bc?.close();
    this.bc = null;
  }
}
