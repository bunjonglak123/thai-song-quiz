import { expect, type BrowserContext, type Page } from "@playwright/test";

/** Host opens the home page, creates a room and enters it. Returns the room code. */
export async function hostCreatesRoom(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.locator("#name").fill(name);
  await page.getByRole("button", { name: "สร้างห้องใหม่" }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]+$/);
  const code = page.url().split("/").pop()!;
  await page.locator("#jname").fill(name);
  await page.getByRole("button", { name: "เปิดห้อง" }).click();
  await expect(page.getByRole("button", { name: "เริ่มเกม" })).toBeVisible();
  return code;
}

/** Another tab joins by typing the code on the home page (each tab is its own player). */
export async function playerJoins(context: BrowserContext, code: string, name: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "เข้าห้อง" }).click();
  await page.waitForURL(new RegExp(`/room/${code}$`));
  await page.locator("#jname").fill(name);
  await page.getByRole("button", { name: "เข้าห้อง" }).click();
  await expect(page.getByText("รอหัวห้องกดเริ่มเกม")).toBeVisible();
  return page;
}

export function choices(page: Page) {
  return page.getByRole("list", { name: "ตัวเลือก" }).getByRole("button");
}

/** Wait until the current question's choices are clickable, then pick one. */
export async function answer(page: Page, index: number) {
  const btn = choices(page).nth(index);
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
}

/** Shortest game settings: 5 rounds, no listen delay. Host only. */
export async function shortGame(host: Page) {
  await host.getByLabel("5 ข้อ", { exact: true }).click();
  await host.getByLabel("0 วิ", { exact: true }).click();
}

/** Records every WebSocket frame a page receives. Call before the page connects. */
export function recordFrames(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", (ws) => ws.on("framereceived", (f) => frames.push(String(f.payload))));
  return frames;
}
