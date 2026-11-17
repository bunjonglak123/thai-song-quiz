import { defineConfig, devices } from "@playwright/test";

// e2e runs the real stack: the Go game server (songquiz-server) plus `next start`.
// MOCK_MUSIC=1 swaps Apple Music for 12 made-up songs with generated tones, so the run
// needs no network or keys. The web build must have NEXT_PUBLIC_GAME_SERVER_URL set to
// http://127.0.0.1:8090 (it is baked into the browser bundle).
// On Windows, start both servers by hand first (Playwright's teardown hangs there);
// reuseExistingServer picks them up.
const PORT = 3200;
const GAME_PORT = 8090;
const SERVER_DIR = process.env.SONGQUIZ_SERVER_DIR ?? "../../../songquiz-server";

export default defineConfig({
  testDir: "e2e",
  timeout: 150_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "e2e", grepInvert: /@shots/ },
    { name: "shots", grep: /@shots/ },
  ],
  webServer: [
    {
      command: "go run ./cmd/server",
      cwd: SERVER_DIR,
      url: `http://127.0.0.1:${GAME_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { PORT: String(GAME_PORT), ALLOWED_ORIGINS: `127.0.0.1:${PORT},localhost:${PORT}` },
    },
    {
      command: `node node_modules/next/dist/bin/next start -p ${PORT} -H 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { MOCK_MUSIC: "1" },
    },
  ],
});
