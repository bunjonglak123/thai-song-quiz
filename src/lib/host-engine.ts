// The host's authoritative game loop. Framework-free so it can be unit tested.
// The host keeps the answers; players only ever receive GameState, which never
// contains the answer to the current or a future question.

import { scoreFor } from "./music.ts";
import type { AnswerMsg, GameSettings, GameState, HostQuestion, PlayerState, Reveal } from "./types";

export const REVEAL_MS = 6000;
export const GRACE_MS = 2500; // network + audio start slack after the countdown
export const MAX_PLAYERS = 20;

export type Member = { id: string; name: string };

export type HostSnapshot = {
  state: GameState;
  questions: HostQuestion[];
  picks: Record<string, Record<string, { choice: number; ms: number }>>;
};

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (h: unknown) => void;
};

export type HostEngineOpts = {
  hostId: string;
  hostName: string;
  onChange: (state: GameState) => void;
  fetchQuestions: (settings: GameSettings) => Promise<{ questions: HostQuestion[]; warnings: string[] }>;
  persist?: (snap: HostSnapshot) => void;
  timers?: Timers;
};

export const DEFAULT_SETTINGS: GameSettings = {
  source: { kind: "chart", size: 100 },
  rounds: 10,
  roundSeconds: 15,
};

export class HostEngine {
  state: GameState;
  private questions: HostQuestion[] = [];
  private picks: HostSnapshot["picks"] = {};
  private timer: unknown = null;
  private timers: Timers;
  private startToken = 0;
  private opts: HostEngineOpts;

  constructor(opts: HostEngineOpts, restore?: HostSnapshot | null) {
    this.opts = opts;
    this.timers = opts.timers ?? {
      set: (fn, ms) => setTimeout(fn, ms),
      clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    if (restore && restore.state.hostId === opts.hostId) {
      this.state = restore.state;
      this.questions = restore.questions;
      this.picks = restore.picks;
      this.resume();
    } else {
      this.state = {
        version: 1,
        hostId: opts.hostId,
        phase: "lobby",
        settings: DEFAULT_SETTINGS,
        players: { [opts.hostId]: newPlayer(opts.hostId, opts.hostName) },
        round: 0,
        totalRounds: 0,
        answered: [],
      };
    }
  }

  /** Re-arm timers after the host page was refreshed mid-game. */
  private resume() {
    const p = this.state.phase;
    if (p === "loading") {
      this.commit({ phase: "lobby", notice: "การโหลดเพลงถูกขัดจังหวะ กดเริ่มเกมใหม่อีกครั้ง" });
    } else if (p === "question") {
      this.arm(() => this.reveal(), (this.state.question?.durationMs ?? 15000) + GRACE_MS);
    } else if (p === "reveal") {
      this.arm(() => this.next(), 2500);
    }
  }

  private commit(patch: Partial<GameState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.opts.persist?.({ state: this.state, questions: this.questions, picks: this.picks });
    this.opts.onChange(this.state);
  }

  private arm(fn: () => void, ms: number) {
    this.disarm();
    this.timer = this.timers.set(fn, ms);
  }
  private disarm() {
    if (this.timer != null) this.timers.clear(this.timer);
    this.timer = null;
  }

  dispose() {
    this.disarm();
  }

  /** Called with the live presence list. Adds newcomers, marks leavers offline. */
  syncMembers(members: Member[]) {
    const players = { ...this.state.players };
    const online = new Set(members.map((m) => m.id));
    let changed = false;
    for (const m of members) {
      const p = players[m.id];
      if (!p) {
        if (Object.keys(players).length >= MAX_PLAYERS) continue;
        players[m.id] = newPlayer(m.id, m.name);
        changed = true;
      } else if (!p.online || p.name !== m.name) {
        players[m.id] = { ...p, online: true, name: m.name.slice(0, 16) };
        changed = true;
      }
    }
    for (const id of Object.keys(players)) {
      if (id === this.state.hostId) continue;
      if (!online.has(id) && players[id].online) {
        players[id] = { ...players[id], online: false };
        changed = true;
      }
    }
    if (!changed) return;
    // In the lobby, people who left are simply removed.
    if (this.state.phase === "lobby") {
      for (const id of Object.keys(players)) if (!players[id].online) delete players[id];
    }
    this.commit({ players });
    this.maybeRevealEarly();
  }

  updateSettings(settings: GameSettings) {
    if (this.state.phase !== "lobby") return;
    this.commit({ settings, error: undefined, notice: undefined });
  }

  async start() {
    if (this.state.phase !== "lobby" && this.state.phase !== "final") return;
    const token = ++this.startToken;
    const players = resetScores(this.state.players, this.state.phase === "final");
    this.commit({ phase: "loading", players, error: undefined, notice: undefined, reveal: undefined, question: undefined });
    try {
      const { questions, warnings } = await this.opts.fetchQuestions(this.state.settings);
      if (token !== this.startToken) return;
      if (!questions.length) throw new Error("ไม่มีคำถาม");
      this.questions = questions;
      this.picks = {};
      this.commit({ totalRounds: questions.length, notice: warnings.length ? warnings.join(" · ") : undefined });
      this.ask(0);
    } catch (e) {
      if (token !== this.startToken) return;
      this.commit({ phase: "lobby", error: e instanceof Error ? e.message : "โหลดเพลงไม่สำเร็จ" });
    }
  }

  private ask(i: number) {
    const q = this.questions[i];
    const durationMs = this.state.settings.roundSeconds * 1000;
    this.picks[q.id] = {};
    this.commit({
      phase: "question",
      round: i,
      answered: [],
      reveal: undefined,
      question: { id: q.id, index: i, previewUrl: q.track.previewUrl, startAt: q.startAt, choices: q.choices, durationMs },
    });
    this.arm(() => this.reveal(), durationMs + GRACE_MS);
  }

  answer(msg: AnswerMsg) {
    const s = this.state;
    if (s.phase !== "question" || !s.question || msg.questionId !== s.question.id) return;
    const player = s.players[msg.playerId];
    if (!player) return;
    const picks = this.picks[s.question.id];
    if (!picks || picks[msg.playerId]) return; // first answer counts
    const choice = Math.round(Number(msg.choice));
    if (!(choice >= 0 && choice < s.question.choices.length)) return;
    const ms = Math.min(Math.max(Math.round(Number(msg.ms)) || 0, 0), s.question.durationMs);
    picks[msg.playerId] = { choice, ms };
    this.commit({ answered: [...s.answered, msg.playerId] });
    this.maybeRevealEarly();
  }

  private maybeRevealEarly() {
    const s = this.state;
    if (s.phase !== "question") return;
    const online = Object.values(s.players).filter((p) => p.online);
    if (online.length && online.every((p) => s.answered.includes(p.id))) {
      this.arm(() => this.reveal(), 600); // brief beat so the last tap registers visually
    }
  }

  reveal() {
    const s = this.state;
    if (s.phase !== "question" || !s.question) return;
    this.disarm();
    const q = this.questions[s.round];
    const picks = this.picks[q.id] ?? {};
    const players: Record<string, PlayerState> = {};
    const outPicks: Reveal["picks"] = {};
    for (const [id, p] of Object.entries(s.players)) {
      const pick = picks[id];
      const correct = !!pick && pick.choice === q.answer;
      const streak = correct ? p.streak + 1 : 0;
      const gain = pick ? scoreFor(correct, pick.ms, s.question.durationMs, streak) : 0;
      players[id] = { ...p, streak, score: p.score + gain, lastGain: gain };
      if (pick) outPicks[id] = { ...pick, gain };
    }
    this.commit({
      phase: "reveal",
      players,
      reveal: { questionId: q.id, answer: q.answer, track: q.track, picks: outPicks },
    });
    this.arm(() => this.next(), REVEAL_MS);
  }

  next() {
    if (this.state.phase !== "reveal") return;
    this.disarm();
    const i = this.state.round + 1;
    if (i < this.questions.length) this.ask(i);
    else this.commit({ phase: "final", question: undefined });
  }

  backToLobby() {
    this.disarm();
    this.startToken++;
    this.questions = [];
    this.picks = {};
    const players = resetScores(this.state.players, true);
    this.commit({ phase: "lobby", players, round: 0, totalRounds: 0, question: undefined, reveal: undefined, answered: [], notice: undefined, error: undefined });
  }
}

function newPlayer(id: string, name: string): PlayerState {
  return { id, name: name.slice(0, 16), score: 0, streak: 0, online: true };
}

function resetScores(players: Record<string, PlayerState>, dropOffline: boolean) {
  const out: Record<string, PlayerState> = {};
  for (const [id, p] of Object.entries(players)) {
    if (dropOffline && !p.online) continue;
    out[id] = { ...p, score: 0, streak: 0, lastGain: undefined };
  }
  return out;
}
