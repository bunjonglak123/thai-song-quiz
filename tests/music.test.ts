// Run: npm test   (uses Node's built-in test runner + type stripping)
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, cleanTitle, isAltVersion, normKey, pickAnswers, primaryArtistKey, scoreFor, type PoolTrack } from "../src/lib/music.ts";
import { sliderToGain } from "../src/lib/audio.ts";

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

test("primaryArtistKey groups collaborations under the main artist", () => {
  assert.equal(primaryArtistKey("Bodyslam & Palmy"), primaryArtistKey("Bodyslam"));
  assert.equal(primaryArtistKey("Three Man Down x Lula"), primaryArtistKey("Three Man Down"));
  assert.equal(primaryArtistKey("BOWKYLION feat. Jeff Satur"), primaryArtistKey("BOWKYLION"));
  assert.equal(primaryArtistKey("ไผ่ พงศธร และ ตั๊กแตน"), primaryArtistKey("ไผ่ พงศธร"));
  assert.notEqual(primaryArtistKey("Potato"), primaryArtistKey("Palmy"));
});

test("chart mode: decoys by the same artist win over other chart songs", () => {
  // Chart: every song by a different artist (the case that made the quiz too easy)
  const chart = ["A", "B", "C", "D", "E", "F"].map((a, i) => t(`ฮิต ${i}`, `ศิลปิน ${a}`, "chart"));
  // Extra songs by each chart artist, usable only as wrong choices
  const decoys = ["A", "B", "C", "D", "E", "F"].flatMap((a) =>
    [1, 2, 3].map((n) => t(`${a} เพลงอื่น ${n}`, `ศิลปิน ${a}`, `decoy:${a}`, { answerable: false })),
  );
  const pool = [...chart, ...decoys];
  const answers = pickAnswers(pool, 6, seeded(11));
  assert.equal(answers.length, 6);
  assert.ok(answers.every((a) => a.group === "chart"), "decoys never become answers");
  const { questions } = buildQuestions(pool, 6, 18, seeded(11), answers);
  for (const q of questions) {
    assert.ok(q.choices.every((c) => c.artist === q.track.artist), `all four by ${q.track.artist}`);
  }
});

test("chart mode without decoys still works (falls back to other chart songs)", () => {
  const chart = ["A", "B", "C", "D", "E"].map((a, i) => t(`ฮิต ${i}`, `ศิลปิน ${a}`, "chart"));
  const { questions } = buildQuestions(chart, 3, 18, seeded(5));
  assert.equal(questions.length, 3);
  for (const q of questions) assert.equal(q.choices.length, 4);
});

test("start point leaves room for listen + answer time inside the 30s preview", () => {
  const pool = Array.from({ length: 8 }, (_, i) => t(`s${i}`, "A"));
  for (const clip of [10, 18, 25]) {
    const { questions } = buildQuestions(pool, 8, clip, seeded(clip));
    assert.ok(questions.every((q) => q.startAt + clip <= 29), `clip ${clip}`);
  }
});

test("volume slider is perceptual: low positions are genuinely quiet", () => {
  assert.equal(sliderToGain(0), 0);
  assert.equal(sliderToGain(1), 1);
  assert.ok(sliderToGain(0.1) < 0.002);
  assert.ok(Math.abs(sliderToGain(0.55) - 0.166) < 0.001);
  assert.ok(sliderToGain(0.5) < 0.13);
});
