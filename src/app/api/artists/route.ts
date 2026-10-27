import type { NextRequest } from "next/server";
import { suggestArtists } from "@/lib/apple";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2 || process.env.MOCK_MUSIC === "1") return Response.json({ artists: [] });
  try {
    return Response.json({ artists: await suggestArtists(q) });
  } catch {
    return Response.json({ artists: [] });
  }
}
