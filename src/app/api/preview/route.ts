import type { NextRequest } from "next/server";

// Same-origin relay for Apple's 30-second previews. The browser decodes the bytes
// with Web Audio (for a volume control that works on iPhone too), and Web Audio
// can only read audio it is allowed to fetch, so it comes through here.
// Only Apple preview hosts are allowed, so this isn't an open proxy: redirects are
// followed by hand and each hop must stay on an Apple host, and the body is capped.

const ALLOWED = /(^|\.)(itunes\.apple\.com|mzstatic\.com|apple\.com)$/i;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const allowed = (u: URL) => u.protocol === "https:" && ALLOWED.test(u.hostname);

/** Pass bytes through until the cap, then fail the stream. */
function capped(body: ReadableStream<Uint8Array>, max: number) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        seen += chunk.byteLength;
        if (seen > max) ctrl.error(new Error("preview too large"));
        else ctrl.enqueue(chunk);
      },
    }),
  );
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (!allowed(url)) return new Response("host not allowed", { status: 403 });

  let upstream: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    upstream = await fetch(url, { cache: "no-store", redirect: "manual" }).catch(() => null);
    if (!upstream || upstream.status < 300 || upstream.status >= 400) break;
    const loc = upstream.headers.get("location");
    let next: URL | null = null;
    try {
      next = loc ? new URL(loc, url) : null;
    } catch {
      next = null;
    }
    if (!next || !allowed(next)) return new Response("redirect not allowed", { status: 502 });
    url = next;
    upstream = null;
  }
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("preview unavailable", { status: 502 });
  }
  const len = Number(upstream.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return new Response("too large", { status: 413 });

  return new Response(capped(upstream.body, MAX_BYTES), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mp4",
      // Preview files never change for a given URL.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
