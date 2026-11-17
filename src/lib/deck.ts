// Server-only: seal the game's questions (with answers) so the host's browser can
// forward them to the game server without being able to read them. Only the game
// server (sharing DECK_SECRET) can open the deck, so no browser ever sees an answer.

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { HostQuestion } from "./types.ts";

function key() {
  const secret = process.env.DECK_SECRET || "tsq-local-dev-only";
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

/** What /api/questions returns: the sealed deck only, never the questions themselves. */
export function deckResponse(questions: HostQuestion[], warnings: string[], poolSize: number) {
  const { deck, deckId } = sealDeck(questions);
  return { deck, deckId, warnings, poolSize };
}
