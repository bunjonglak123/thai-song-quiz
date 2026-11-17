import { expect, test } from "@playwright/test";
import { answer, choices, hostCreatesRoom, playerJoins, shortGame } from "./helpers";

test("host leaves mid-game: the game goes on and the controls move to a guest", async ({ page: host, context }) => {
  const code = await hostCreatesRoom(host, "Host");
  const a = await playerJoins(context, code, "Aom");
  const b = await playerJoins(context, code, "Bee");
  await shortGame(host);
  await host.getByRole("button", { name: "เริ่มเกม" }).click();
  await expect(choices(a).first()).toBeEnabled({ timeout: 30_000 });

  await host.close();

  // Aom joined first, so Aom gets the controls once the 3 s grace is over.
  await expect(a.getByText(/ตอนนี้คุณควบคุมเกมแทน/)).toBeVisible({ timeout: 15_000 });
  await expect(b.getByText(/ตอนนี้ Aom ควบคุมเกมแทน/)).toBeVisible({ timeout: 15_000 });

  for (let round = 0; round < 5; round++) {
    await answer(a, 0);
    await answer(b, 1);
    await expect(a.getByText("เฉลย", { exact: true })).toBeVisible();
  }
  await expect(a.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });
  await expect(b.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });
  await expect(a.getByRole("button", { name: /เล่นอีกรอบ/ })).toBeVisible();
});
