import type { NextRequest } from "next/server";

// Generates a 30-second tone as WAV. Only for offline testing (MOCK_MUSIC=1).
export async function GET(req: NextRequest) {
  const f = Math.min(2000, Math.max(100, Number(req.nextUrl.searchParams.get("f")) || 440));
  if (process.env.MOCK_MUSIC !== "1") return new Response("Not found", { status: 404 });
  const rate = 8000;
  const seconds = 30;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  w(36, "data");
  v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const beat = Math.floor(i / (rate / 2)) % 2 === 0 ? 1 : 1.5; // simple two-note pattern
    v.setUint8(44 + i, 128 + Math.round(40 * Math.sin((2 * Math.PI * f * beat * i) / rate)));
  }
  return new Response(buf, { headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=3600" } });
}
