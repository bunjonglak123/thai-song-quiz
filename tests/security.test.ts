// Security hardening: site headers and the Apple preview relay's limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.ts";
import { GET as previewGET } from "../src/app/api/preview/route.ts";

const req = (u: string) => ({ nextUrl: new URL(`http://localhost/api/preview?u=${encodeURIComponent(u)}`) }) as never;

function stub(handler: (u: string) => Response) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(u);
    return handler(u);
  }) as typeof fetch;
  return calls;
}

test("every page gets the security headers", async () => {
  assert.ok(nextConfig.headers, "next.config has headers()");
  const rules = await nextConfig.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "a rule covers every path");
  const get = (k: string) => all.headers.find((h) => h.key.toLowerCase() === k)?.value ?? "";
  assert.match(get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(get("content-security-policy"), /object-src 'none'/);
  assert.match(get("content-security-policy"), /base-uri 'self'/);
  assert.equal(get("x-frame-options"), "DENY");
  assert.equal(get("x-content-type-options"), "nosniff");
  assert.ok(get("referrer-policy"));
  assert.ok(get("permissions-policy"));
  assert.equal(nextConfig.poweredByHeader, false);
});

test("preview relay does not follow a redirect to another host", async () => {
  const calls = stub((u) =>
    u.includes("evil")
      ? new Response("PWNED")
      : new Response(null, { status: 302, headers: { location: "https://evil.example.com/x" } }),
  );
  const r = await previewGET(req("https://audio-ssl.itunes.apple.com/p/1.m4a"));
  assert.notEqual(r.status, 200);
  assert.ok(!calls.some((c) => c.includes("evil")), "never fetched the outside host");
});

test("preview relay follows a redirect that stays on Apple hosts", async () => {
  stub((u) =>
    u.includes("mzstatic")
      ? new Response("AUDIO", { headers: { "content-type": "audio/x-m4a" } })
      : new Response(null, { status: 302, headers: { location: "https://audio-ssl.mzstatic.com/p/1.m4a" } }),
  );
  const r = await previewGET(req("https://audio-ssl.itunes.apple.com/p/1.m4a"));
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "AUDIO");
});

test("preview relay stops a body over 4 MB even without content-length", async () => {
  const big = new Uint8Array(5 * 1024 * 1024);
  stub(() => new Response(new ReadableStream({ start(c) { c.enqueue(big); c.close(); } })));
  const r = await previewGET(req("https://audio-ssl.itunes.apple.com/p/1.m4a"));
  if (r.status === 200) await assert.rejects(r.arrayBuffer());
  else assert.equal(r.status, 413);
});
