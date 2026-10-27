import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuestions, cleanVideoTitle, normKey, parseYouTubeItem, pickMatch, type PoolTrack } from "../src/lib/music.ts";
import { resolveTrackList, resolveYouTube } from "../src/lib/playlist.ts";
import { PRESETS } from "../src/lib/presets.ts";

function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const apple = (title: string, artist: string, id = title): PoolTrack => ({
  id,
  title,
  rawTitle: title,
  artist,
  previewUrl: `https://audio-ssl.itunes.apple.com/${encodeURIComponent(id)}.m4a`,
  group: "playlist",
});

// A tiny fake Apple Music catalogue
const CATALOG = [
  apple("ฝนตกไหม", "Three Man Down"),
  apple("ทางของฝุ่น", "Atom ชนกันต์"),
  apple("คิดถึง", "Bodyslam"),
  apple("ความเชื่อ", "Bodyslam"),
  apple("ปลายทาง", "Bodyslam"),
  apple("ขอบฟ้า", "Bodyslam"),
  apple("Last Sunday", "Polycat"),
  apple("ข้อความ", "Getsunova"),
  apple("ไกลแค่ไหนคือใกล้", "Getsunova"),
  apple("คิดถึงเธอ", "Someone Else"),
];

function fakeSearch(calls: string[]) {
  return async (term: string) => {
    calls.push(term);
    const q = normKey(term);
    return CATALOG.filter((t) => q.includes(normKey(t.title)) || q.includes(normKey(t.artist)));
  };
}

test("cleanVideoTitle strips MV noise", () => {
  assert.equal(cleanVideoTitle("ฝนตกไหม - Three Man Down 【Official MV】"), "ฝนตกไหม - Three Man Down");
  assert.equal(cleanVideoTitle("Getsunova - ข้อความ (Official Music Video) | GMM GRAMMY"), "Getsunova - ข้อความ");
  assert.equal(cleanVideoTitle("Polycat - Last Sunday [Lyric Video] #polycat"), "Polycat - Last Sunday");
  assert.equal(cleanVideoTitle("ทางของฝุ่น - Atom ชนกันต์ feat. ใครสักคน"), "ทางของฝุ่น - Atom ชนกันต์");
});

test("parseYouTubeItem uses YouTube Music Topic channels as the artist", () => {
  assert.deepEqual(parseYouTubeItem("ความเชื่อ", "Bodyslam - Topic"), { query: "ความเชื่อ Bodyslam", title: "ความเชื่อ", artist: "Bodyslam" });
  assert.deepEqual(parseYouTubeItem("ข้อความ (Official MV)", "GMM GRAMMY OFFICIAL"), { query: "ข้อความ" });
});

test("pickMatch needs the title to match, and prefers the right artist", () => {
  const results = [apple("คิดถึงเธอ", "Someone Else"), apple("คิดถึง", "Bodyslam")];
  assert.equal(pickMatch(results, { query: "คิดถึง Bodyslam", title: "คิดถึง", artist: "Bodyslam" })?.artist, "Bodyslam");
  assert.equal(pickMatch([apple("อื่นๆ", "X")], { query: "คิดถึง Bodyslam", title: "คิดถึง", artist: "Bodyslam" }), null);
  // YouTube style: no clean title, the result title must appear in the query
  assert.equal(pickMatch(results, { query: "Bodyslam - คิดถึง" })?.title, "คิดถึง");
  assert.equal(pickMatch([apple("ไม่เกี่ยว", "X")], { query: "Bodyslam - คิดถึง" }), null);
});

test("Spotify list: answers get previews, the rest become title-only decoys, searches are capped", async () => {
  const calls: string[] = [];
  const list = [
    { title: "คิดถึง", artist: "Bodyslam" },
    { title: "ความเชื่อ", artist: "Bodyslam" },
    { title: "ปลายทาง", artist: "Bodyslam" },
    { title: "ขอบฟ้า", artist: "Bodyslam" },
    { title: "ฝนตกไหม", artist: "Three Man Down" },
    { title: "Last Sunday", artist: "Polycat" },
    { title: "ข้อความ", artist: "Getsunova" },
    { title: "ไม่มีบน Apple", artist: "ไม่มีใคร" },
    { title: "คิดถึง (feat. ใครสักคน)", artist: "Bodyslam" }, // duplicate of the first after cleaning
  ];
  const r = await resolveTrackList(list, 3, fakeSearch(calls), seeded(3));
  assert.equal(r.answers.length, 3);
  assert.ok(r.answers.every((a) => a.previewUrl.startsWith("https://")));
  assert.ok(calls.length <= 3 * 2 + 4);
  const decoys = r.pool.filter((t) => t.answerable === false);
  assert.ok(decoys.length >= 4);
  assert.ok(decoys.every((d) => d.previewUrl === ""));

  const { questions } = buildQuestions(r.pool, 3, 18, seeded(4), r.answers);
  assert.equal(questions.length, 3);
  for (const q of questions) {
    assert.equal(q.choices.length, 4);
    assert.ok(q.track.previewUrl, "answers always have a preview");
    assert.equal(new Set(q.choices.map((c) => normKey(c.title))).size, 4);
  }
  // Bodyslam answers get Bodyslam decoys
  const bq = questions.find((q) => q.track.artist === "Bodyslam");
  if (bq) assert.ok(bq.choices.filter((c) => c.artist === "Bodyslam").length >= 3);
});

test("Spotify list too short", async () => {
  const r = await resolveTrackList([{ title: "a", artist: "b" }], 5, fakeSearch([]));
  assert.equal(r.answers.length, 0);
  assert.equal(r.warnings.length, 1);
});

test("YouTube: matched clips become answers and decoys with Apple's clean titles", async () => {
  const calls: string[] = [];
  const items = [
    { videoTitle: "ฝนตกไหม - Three Man Down 【Official MV】", channel: "Gene Lab" },
    { videoTitle: "Getsunova - ข้อความ (Official MV)", channel: "GMM GRAMMY" },
    { videoTitle: "Polycat - Last Sunday [Official MV]", channel: "Smallroom" },
    { videoTitle: "ความเชื่อ", channel: "Bodyslam - Topic" },
    { videoTitle: "ปลายทาง", channel: "Bodyslam - Topic" },
    { videoTitle: "vlog ไปเที่ยวทะเล", channel: "someone" },
  ];
  const r = await resolveYouTube(items, 10, fakeSearch(calls), seeded(2));
  assert.equal(r.pool.length, 5);
  assert.equal(r.answers.length, 2, "keeps 3 matched songs back as wrong choices");
  assert.ok(r.warnings.some((w) => w.includes("1 คลิป")));
  assert.ok(r.pool.some((t) => t.title === "ฝนตกไหม" && t.artist === "Three Man Down"));
});

test("presets have up to 8 artists and unique ids", () => {
  assert.equal(new Set(PRESETS.map((p) => p.id)).size, PRESETS.length);
  for (const p of PRESETS) assert.ok(p.artists.length >= 4 && p.artists.length <= 8, p.id);
});
