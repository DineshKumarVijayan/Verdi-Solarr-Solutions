import { defineConfig, devices } from "@playwright/test";

// Visual lock for the mobile-app UI work (separate from `npm run test:e2e`).
// desktop-1440 / desktop-1024: full-page pixel compare against tests/visual/desktop-baseline.
// mobile-390: phone metrics + first-screen screenshots (tests/visual/out, git-ignored).
export default defineConfig({
  testDir: "tests/visual",
  testMatch: /\.visual\.ts$/,
  timeout: 15 * 60_000,
  workers: 1,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/desktop-baseline/{projectName}/{arg}{ext}",
  // maxDiffPixels: Chromium on Windows renders text edges (anti-aliasing) slightly differently between runs
  // (observed up to ~770 px per page). Anything that moves or resizes an element changes far more pixels.
  expect: { toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 900 } },
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:5173", reducedMotion: "reduce", locale: "en-IN", timezoneId: "Asia/Kolkata" },
  webServer: { command: "npm run dev -- --port 5173 --strictPort", url: (process.env.BASE_URL ?? "http://localhost:5173") + "/api/health", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "desktop-1440", testMatch: /desktop\.visual\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1024", testMatch: /desktop\.visual\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } } },
    { name: "mobile-390", testMatch: /mobile-metrics\.visual\.ts/, use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
});
