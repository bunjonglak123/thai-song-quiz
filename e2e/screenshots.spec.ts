import { expect, test } from "@playwright/test";
import { answer, choices, hostCreatesRoom, playerJoins } from "./helpers";

// README screenshots from mock data only. Run with: npm run screenshots
const OUT = "docs/screenshots";

test("capture README screenshots @shots", async ({ page: host, context, browser }) => {
  await host.setViewportSize({ width: 1280, height: 800 });
  await host.goto("/");
  await host.locator("#name").fill("Ploy");
  await host.screenshot({ path: `${OUT}/home.png` });

  const code = await hostCreatesRoom(host, "Ploy");
  const guests = [];
  for (const name of ["Nok", "Ton"]) guests.push(await playerJoins(context, code, name));
  await expect(host.getByText("ในห้อง 3 คน")).toBeVisible();
  await host.screenshot({ path: `${OUT}/lobby.png` });

  await host.getByLabel("5 ข้อ", { exact: true }).click();
  await host.getByLabel("0 วิ", { exact: true }).click();
  await host.getByRole("button", { name: "เริ่มเกม" }).click();

  await expect(choices(host).first()).toBeEnabled({ timeout: 30_000 });
  await answer(guests[0], 2);
  await host.waitForTimeout(800);
  await host.screenshot({ path: `${OUT}/question.png` });

  await answer(host, 0);
  await answer(guests[1], 1);
  await expect(host.getByText("เฉลย", { exact: true })).toBeVisible();
  await host.waitForTimeout(600);
  await host.screenshot({ path: `${OUT}/reveal.png` });

  // Phone view of a player joining the same room.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await phone.newPage();
  await p.goto(`/room/${code}`);
  await p.locator("#jname").fill("Mint");
  await p.screenshot({ path: `${OUT}/mobile.png` });
  await phone.close();

  for (let r = 1; r < 5; r++) {
    await answer(host, r % 4);
    for (const g of guests) await answer(g, (r + 1) % 4);
    await expect(host.getByText("เฉลย", { exact: true })).toBeVisible();
  }
  await expect(host.getByText("จบเกม")).toBeVisible({ timeout: 30_000 });
  await host.waitForTimeout(1500);
  await host.screenshot({ path: `${OUT}/final.png` });
});
