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

/** Players only ever see the title, so the artist's voice can't give the answer away. */
export type Choice = { title: string; artist?: string };

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
  | { kind: "artists"; artists: string[] }
  | { kind: "preset"; id: string }
  /** Host's own Spotify playlist; the host's browser reads it at game start. */
  | { kind: "spotify"; playlistId: string; name: string; count?: number }
  | { kind: "youtube"; playlistId: string; name?: string }
  /** A playlist the host built in this app (Apple Music track ids). */
  | { kind: "custom"; name: string; trackIds: string[]; listId?: string };

export type GameSettings = {
  source: SongSource;
  rounds: number;
  roundSeconds: number;
  /** Seconds of listening before the choices appear (0 = show immediately). */
  listenSeconds: number;
};

export type PlayerState = {
  id: string;
  name: string;
  color?: string; // avatar colour the player picked, #rrggbb
  score: number;
  streak: number;
  online: boolean;
  lastGain?: number;
  prevRank?: number; // 1-based rank before the last question was scored
};

export type PublicQuestion = {
  id: string;
  index: number; // 0-based round index
  previewUrl: string;
  startAt: number;
  choices: Choice[];
  lockMs: number; // listen-only time before choices appear
  durationMs: number; // answering time after the choices appear
};

export type Reveal = {
  questionId: string;
  answer: number;
  track: Track;
  choices?: Choice[]; // with artists, shown after the reveal
  picks: Record<string, { choice: number; gain: number; ms: number }>;
};

export type Phase = "lobby" | "loading" | "question" | "reveal" | "standings" | "final";

/** The full game state the game server sends. Contains no future answers. */
export type GameState = {
  version: number;
  /** Who has the host controls (settings, start, skip). */
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  players: Record<string, PlayerState>;
  round: number; // 0-based current round
  totalRounds: number;
  question?: PublicQuestion;
  answered: string[]; // player ids who answered current question
  /** Who picked what so far. The UI only shows it to players who have already answered. */
  livePicks?: Record<string, number>;
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

/** A player in the room as the server knows them. */
export type Member = { id: string; name: string; color?: string };
