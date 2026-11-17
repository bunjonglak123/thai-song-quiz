// The game server opens sealed decks; the web app only ever hands out the sealed form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deckResponse, sealDeck } from "../src/lib/deck.ts";
import type { HostQuestion } from "../src/lib/types.ts";

const qs = [
  {
    id: "q0",
    startAt: 0,
    answer: 2,
    track: { id: "t0", title: "เพลง", rawTitle: "เพลง", artist: "ศิลปิน", previewUrl: "https://x/0.m4a" },
    choices: [0, 1, 2, 3].map((c) => ({ title: `ตัวเลือก ${c}`, artist: "ศิลปิน" })),
  },
] as HostQuestion[];

test("questions response carries the sealed deck, never the questions or answers", () => {
  const body = deckResponse(qs, ["หมายเหตุ"], 12);
  assert.equal("questions" in body, false);
  assert.deepEqual(body.warnings, ["หมายเหตุ"]);
  assert.equal(body.poolSize, 12);
  const json = JSON.stringify(body);
  assert.ok(!json.includes('"answer"'), "no answer key in the response");
  assert.ok(!json.includes("ตัวเลือก"), "no readable choices in the response");
});

test("sealDeck output is 4 dot-separated base64url parts", () => {
  const { deck, deckId } = sealDeck(qs);
  const parts = deck.split(".");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], deckId);
  for (const p of parts) assert.match(p, /^[A-Za-z0-9_-]+$/);
});
