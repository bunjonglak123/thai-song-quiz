import { openDeck } from "@/lib/deck";

// The player taking over as host sends the sealed question deck here to get the
// questions back, then carries on the game from the same question.
export async function POST(req: Request) {
  try {
    const { deck } = (await req.json()) as { deck?: string };
    return Response.json(openDeck(String(deck ?? "")));
  } catch {
    return Response.json({ error: "เปิดชุดคำถามไม่สำเร็จ" }, { status: 400 });
  }
}
