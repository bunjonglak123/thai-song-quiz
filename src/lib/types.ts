// Shared types for the quiz game.

export type Track = {
  id: string;
  title: string; // cleaned title shown to players
  rawTitle: string; // title as listed on Apple Music
  artist: string;
  album?: string;
  artwork?: string;
  previewUrl: string;
  storeUrl?: string;
};

export type Choice = { title: string; artist: string };

/** A question as the host keeps it (includes the answer). */
export type HostQuestion = {
  id: string;
  track: Track;
  choices: Choice[];
  answer: number; // index into choices
  startAt: number; // seconds into the 30s preview to start playing
};

export type SongSource =
  | { kind: "chart"; size: 50 | 100 }
  | { kind: "artists"; artists: string[] };

export type GameSettings = {
  source: SongSource;
  rounds: number;
  roundSeconds: number;
};

export type PlayerState = {
  id: string;
  name: string;
  score: number;
  streak: number;
  online: boolean;
  lastGain?: number;
};

export type PublicQuestion = {
  id: string;
  index: number; // 0-based round index
  previewUrl: string;
  startAt: number;
  choices: Choice[];
  durationMs: number;
};

export type Reveal = {
  questionId: string;
  answer: number;
  track: Track;
  picks: Record<string, { choice: number; gain: number; ms: number }>;
};

export type Phase = "lobby" | "loading" | "question" | "reveal" | "final";

/** The full game state the host broadcasts. Contains no future answers. */
export type GameState = {
  version: number;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  round: number; // 0-based current round
  totalRounds: number;
  question?: PublicQuestion;
  answered: string[]; // player ids who answered current question
  reveal?: Reveal;
  error?: string;
  notice?: string;
};

export type AnswerMsg = {
  playerId: string;
  questionId: string;
  choice: number;
  ms: number; // elapsed time measured on the player's device
};
