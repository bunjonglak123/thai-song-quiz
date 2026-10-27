// Run: npm test   (uses Node's built-in test runner + type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, cleanTitle, isAltVersion, normKey, scoreFor, type PoolTrack } from "../src/lib/music.ts";

function seeded(seed = 42) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function t(title: string, artist: string, group = artist, extra: Partial<PoolTrack> = {}): PoolTrack {
  return { id: title + artist, title: cleanTitle(title), rawTitle: title, artist, previewUrl: "x.m4a", group, ...extra };
}

test("cleanTitle strips feat/OST/brackets", () => {
  assert.equal(cleanTitle("ทางของฝุ่น (feat. Palmy)"), "ทางของฝุ่น");
  assert.equal(cleanTitle("ลมหายใจ (เพลงประกอบละคร บ้านนี้)"), "ลมหายใจ");
  assert.equal(cleanTitle("Song Title - From \"Movie\""), "Song Title");
  assert.equal(cleanTitle("Hello ft. Someone"), "Hello");
  assert.equal(cleanTitle("(intro)"), "(intro)"); // never empties a title
});

test("isAltVersion catches Thai and English alt versions", () => {
  for (const s of ["ความรัก (Live)", "ความรัก (Acoustic Version)", "ความรัก [คาราโอเกะ]", "ความรัก (เวอร์ชั่นใหม่)", "Love (Remix)", "Love (Sped Up)", "Love (Inst.)"]) {
    assert.ok(isAltVersion(s), s);
  }
  assert.ok(isAltVersion("ความรัก", "Bodyslam Live in Concert"));
  assert.ok(isAltVersion("ความรัก", "คอนเสิร์ต 20 ปี"));
  for (const s of ["ความรัก", "Liver", "Discover", "Love Story", "ใจกลางเมือง"]) {
    assert.ok(!isAltVersion(s), s);
  }
});

test("normKey ignores spacing, case and punctuation", () => {
  assert.equal(normKey("ขอ  โทษ!"), normKey("ขอโทษ"));
  assert.equal(normKey("Hello World (feat. X)"), "helloworld");
});

test("buildQuestions: 4 distinct choices, answer index correct, same-artist distractors first", () => {
  const pool: PoolTrack[] = [];
  for (let i = 0; i < 8; i++) pool.push(t(`เพลงเอ ${i}`, "ศิลปิน A"));
  for (let i = 0; i < 8; i++) pool.push(t(`เพลงบี ${i}`, "ศิลปิน B"));
  const { questions, warnings } = buildQuestions(pool, 10, 15, seeded());
  assert.equal(questions.length, 10);
  assert.deepEqual(warnings, []);
  const answerTitles = new Set<string>();
  for (const q of questions) {
    assert.equal(q.choices.length, 4);
    assert.equal(new Set(q.choices.map((c) => normKey(c.title))).size, 4);
    assert.equal(q.choices[q.answer].title, q.track.title);
    // all distractors share the answer's artist when the group is big enough
    assert.ok(q.choices.every((c) => c.artist === q.track.artist));
    assert.ok(q.startAt >= 0 && q.startAt <= 12);
    answerTitles.add(q.track.title);
    assert.ok(!("group" in q.track));
  }
  assert.equal(answerTitles.size, 10, "no repeated answers");
  // answers alternate across artists
  const a = questions.filter((q) => q.track.artist === "ศิลปิน A").length;
  assert.equal(a, 5);
});

test("buildQuestions: small groups borrow distractors from other groups", () => {
  const pool = [t("หนึ่ง", "A"), t("สอง", "A"), t("สาม", "B"), t("สี่", "B"), t("ห้า", "C")];
  const { questions } = buildQuestions(pool, 3, 15, seeded(7));
  assert.equal(questions.length, 3);
  for (const q of questions) assert.equal(q.choices.length, 4);
});

test("buildQuestions: dedupes same song and warns when pool is short", () => {
  const pool = [t("หนึ่ง", "A"), t("หนึ่ง (feat. X)", "A"), t("สอง", "A"), t("สาม", "A"), t("สี่", "A"), t("ห้า", "A")];
  const { questions, warnings } = buildQuestions(pool, 10, 15, seeded(3));
  assert.equal(questions.length, 5);
  assert.equal(warnings.length, 1);
});

test("buildQuestions: fewer than 4 songs -> no questions", () => {
  const { questions, warnings } = buildQuestions([t("a", "A"), t("b", "A"), t("c", "A")], 5, 15);
  assert.equal(questions.length, 0);
  assert.equal(warnings.length, 1);
});

test("scoreFor rewards speed and streaks", () => {
  assert.equal(scoreFor(false, 100, 15000, 3), 0);
  assert.equal(scoreFor(true, 0, 15000, 1), 1000);
  assert.equal(scoreFor(true, 15000, 15000, 1), 500);
  assert.equal(scoreFor(true, 15000, 15000, 3), 700);
  assert.equal(scoreFor(true, 15000, 15000, 10), 800);
});
