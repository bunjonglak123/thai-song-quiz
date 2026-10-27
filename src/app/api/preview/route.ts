import type { NextRequest } from "next/server";

// Same-origin relay for Apple's 30-second previews. The browser decodes the bytes
// with Web Audio (for a volume control that works on iPhone too), and Web Audio
// can only read audio it is allowed to fetch, so it comes through here.
// Only Apple preview hosts are allowed, so this isn't an open proxy.

const ALLOWED = /(^|\.)(itunes\.apple\.com|mzstatic\.com|apple\.com)$/i;
const MAX_BYTES = 4 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u") ?? "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (url.protocol !== "https:" || !ALLOWED.test(url.hostname)) {
    return new Response("host not allowed", { status: 403 });
  }

  const upstream = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response("preview unavailable", { status: 502 });
  }
  const len = Number(upstream.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return new Response("too large", { status: 413 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mp4",
      // Preview files never change for a given URL.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
