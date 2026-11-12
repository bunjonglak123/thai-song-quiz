import { defineConfig, devices } from "@playwright/test";

// The game runs in multi-tab test mode: no Supabase env, so pages in one browser
// context talk over BroadcastChannel. MOCK_MUSIC=1 swaps Apple Music for 12 made-up
// songs with generated tones, so the run needs no network or keys.
const PORT = 3200;

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
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MOCK_MUSIC: "1",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
