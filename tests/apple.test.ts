// Apple API parsing with a stubbed fetch (no network needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { getThaiChart, mapLimit, searchArtistDecoys, searchArtistSongs, toPoolTrack } from "../src/lib/apple.ts";
import { GET as previewGET } from "../src/app/api/preview/route.ts";

const song = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  wrapperType: "track",
  kind: "song",
  trackId: id,
  trackName: name,
  artistName: "Bodyslam",
  collectionName: "Album",
  artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/x/${id}/100x100bb.jpg`,
  previewUrl: `https://audio-ssl.itunes.apple.com/p/${id}.m4a`,
  trackViewUrl: `https://music.apple.com/th/album/x/${id}?i=${id}`,
  ...extra,
});

function stubFetch(routes: [RegExp, unknown | ((u: string) => unknown)][]) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(u);
    for (const [re, body] of routes) {
      if (re.test(u)) {
        const b = typeof body === "function" ? (body as (u: string) => unknown)(u) : body;
        if (b instanceof Response) return b;
        return new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return calls;
}

test("toPoolTrack filters non-songs, missing previews and alt versions; upsizes artwork", () => {
  assert.equal(toPoolTrack({ ...song(1, "x"), kind: "music-video" }, "g"), null);
  assert.equal(toPoolTrack({ ...song(1, "x"), previewUrl: undefined }, "g"), null);
  assert.equal(toPoolTrack(song(1, "ความเชื่อ (Live)"), "g"), null);
  const t = toPoolTrack(song(1, "ความเชื่อ (feat. ป้าง)"), "g")!;
  assert.equal(t.title, "ความเชื่อ");
  assert.equal(t.rawTitle, "ความเชื่อ (feat. ป้าง)");
  assert.match(t.artwork!, /600x600bb\.jpg$/);
});

test("getThaiChart keeps chart order, drops unusable tracks, falls back to the old RSS host", async () => {
  const calls = stubFetch([
    [/rss\.marketingtools\.apple\.com/, new Response("down", { status: 503 })],
    [/rss\.applemarketingtools\.com\/api\/v2\/th\/music\/most-played\/50\/songs\.json/, { feed: { results: [{ id: "3" }, { id: "1" }, { id: "2" }, { id: "4" }] } }],
    [/itunes\.apple\.com\/lookup\?id=3,1,2,4&country=th/, { results: [song(1, "หนึ่ง"), song(2, "สอง (Karaoke)"), song(3, "สาม"), song(4, "สี่", { previewUrl: undefined })] }],
  ]);
  const tracks = await getThaiChart(50);
  assert.deepEqual(tracks.map((t) => t.title), ["สาม", "หนึ่ง"]);
  assert.ok(tracks.every((t) => t.group === "chart"));
  assert.equal(calls.length, 3);
});

test("searchArtistSongs falls back to a plain term search when artistTerm finds too little", async () => {
  const calls = stubFetch([
    [/attribute=artistTerm/, { results: [song(10, "a")] }],
    [/itunes\.apple\.com\/search\?term=%E0%B8%9A/, { results: [song(11, "ก"), song(12, "ข"), song(13, "ค"), song(14, "ง"), song(15, "จ (Acoustic)")] }],
  ]);
  const tracks = await searchArtistSongs("บอดี้สแลม");
  assert.equal(tracks.length, 4);
  assert.ok(tracks.every((t) => t.group === "บอดี้สแลม"));
  assert.ok(calls[0].includes("country=th"));
  assert.equal(calls.length, 2);
});

test("searchArtistDecoys marks tracks as decoy-only and makes one call", async () => {
  const calls = stubFetch([[/attribute=artistTerm&limit=40/, { results: [song(21, "x"), song(22, "y")] }]]);
  const d = await searchArtistDecoys("Potato");
  assert.equal(d.length, 2);
  assert.ok(d.every((t) => t.answerable === false));
  assert.equal(calls.length, 1);
});

test("mapLimit keeps going when some jobs fail and respects the limit", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    if (n === 4) throw new Error("rate limited");
    return n;
  });
  assert.deepEqual(out.sort(), [1, 2, 3, 5, 6]);
  assert.ok(peak <= 3);
});

test("preview relay only fetches Apple preview hosts", async () => {
  const calls = stubFetch([[/audio-ssl\.itunes\.apple\.com/, new Response("AUDIO", { headers: { "content-type": "audio/x-m4a" } })]]);
  const req = (u: string) => ({ nextUrl: new URL(`http://localhost/api/preview?u=${encodeURIComponent(u)}`) }) as never;
  assert.equal((await previewGET(req("https://evil.example.com/a.m4a"))).status, 403);
  assert.equal((await previewGET(req("http://audio-ssl.itunes.apple.com/a.m4a"))).status, 403);
  assert.equal((await previewGET(req("https://itunes.apple.com.evil.com/a.m4a"))).status, 403);
  assert.equal((await previewGET(req("not a url"))).status, 400);
  const ok = await previewGET(req("https://audio-ssl.itunes.apple.com/p/1.m4a"));
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "AUDIO");
  assert.equal(calls.length, 1);
});
