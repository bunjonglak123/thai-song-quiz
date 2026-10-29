// Server-only: seal the game's questions (with answers) so every player can hold a copy
// for a host takeover without being able to read it. Only this server can open it.
//
// Honest limit: anyone who captures the sealed deck could also POST it to /api/deck.
// That takes deliberate effort; for a game between friends it is an acceptable trade
// for keeping the game alive when the host drops out.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { HostQuestion } from "./types.ts";

const MAX_DECK_CHARS = 400_000;

function key() {
  const secret = process.env.DECK_SECRET || process.env.SUPABASE_JWT_SECRET || "tsq-local-dev-only";
  return createHash("sha256").update(`tsq-deck-v1:${secret}`).digest();
}

const b64url = (b: Buffer) => b.toString("base64url");

export function sealDeck(questions: HostQuestion[]): { deckId: string; deck: string } {
  const deckId = randomBytes(8).toString("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(deckId));
  const body = Buffer.concat([cipher.update(JSON.stringify(questions), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { deckId, deck: `${deckId}.${b64url(iv)}.${b64url(tag)}.${b64url(body)}` };
}

export function openDeck(deck: string): { deckId: string; questions: HostQuestion[] } {
  if (typeof deck !== "string" || deck.length > MAX_DECK_CHARS) throw new Error("bad deck");
  const [deckId, iv, tag, body] = deck.split(".");
  if (!deckId || !iv || !tag || !body) throw new Error("bad deck");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(deckId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const json = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
  const questions = JSON.parse(json) as HostQuestion[];
  if (!Array.isArray(questions)) throw new Error("bad deck");
  return { deckId, questions };
}
