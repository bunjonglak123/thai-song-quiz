import { expect, test } from "@playwright/test";
import { answer, hostCreatesRoom, playerJoins, shortGame } from "./helpers";

test("a finished 5-round game with 2 players shows up on the leaderboard", async ({ page: host, context }) => {
  const stamp = String(Date.now()).slice(-5);
  const hostName = `Lead${stamp}`;
  const guestName = `Next${stamp}`;
  const code = await hostCreatesRoom(host, hostName);
  const guest = await playerJoins(context, code, guestName);
  await shortGame(host);
  await host.getByRole("button", { name: "เริ่มเกม" }).click();
  for (let round = 0; round < 5; round++) {
    await answer(host, 0);
    await answer(guest, 0);
    await expect(host.getByText("เฉลย", { exact: true })).toBeVisible();
  }
  await expect(host.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });

  const board = await context.newPage();
  await board.goto("/leaderboard");
  await board.getByRole("tab", { name: "ตลอดกาล" }).click();
  await expect(board.getByText(hostName)).toBeVisible();
  await expect(board.getByText(guestName)).toBeVisible();
});
