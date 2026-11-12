import { expect, test } from "@playwright/test";
import { answer, choices, hostCreatesRoom, playerJoins } from "./helpers";

test("two players play a full 5-round game to the final screen", async ({ page: host, context }) => {
  const code = await hostCreatesRoom(host, "Host");
  expect(code).toMatch(/^[A-Z0-9]{5}$/);

  const guest = await playerJoins(context, code, "Guest");

  // Both players appear in the host's lobby.
  const players = host.getByRole("region", { name: /ในห้อง \d+ คน/ });
  await expect(players.getByText("Guest")).toBeVisible();

  // Shortest game: 5 rounds, no listen delay.
  await host.getByLabel("5 ข้อ", { exact: true }).click();
  await host.getByLabel("0 วิ", { exact: true }).click();
  await host.getByRole("button", { name: "เริ่มเกม" }).click();

  for (let round = 0; round < 5; round++) {
    // Same question on both screens: 4 choices each, identical titles.
    await expect(choices(host)).toHaveCount(4, { timeout: 30_000 });
    await expect(choices(guest)).toHaveCount(4, { timeout: 30_000 });
    await expect(choices(host).first()).toBeEnabled({ timeout: 30_000 });
    expect(await choices(guest).allInnerTexts()).toEqual(await choices(host).allInnerTexts());

    await answer(host, 0);
    await answer(guest, 1);

    // Everyone answered → reveal shows the correct choice to both.
    await expect(host.getByText("เฉลย", { exact: true })).toBeVisible();
    await expect(guest.getByText("เฉลย", { exact: true })).toBeVisible();
  }

  await expect(host.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });
});

test("joining a room code with nobody in it shows the join form, not a crash", async ({ page }) => {
  await page.goto("/room/ZZZZZ");
  await expect(page.getByText("ZZZZZ")).toBeVisible();
  await expect(page.locator("#jname")).toBeVisible();
});
