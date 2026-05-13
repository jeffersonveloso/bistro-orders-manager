import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:3001",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "node scripts/reset-sqlite-db.mjs data/bistro-production.e2e.sqlite && BISTRO_ORDER_SYNC_PROVIDER_MODE=mock BISTRO_DATABASE_PATH=data/bistro-production.e2e.sqlite BISTRO_ACCESS_SESSION_SECRET=playwright-session-secret BISTRO_ACCESS_PIN_KITCHEN_1=1111 BISTRO_ACCESS_PIN_KITCHEN_2=2222 BISTRO_ACCESS_PIN_SALON=3333 npm run start -- --hostname 127.0.0.1 --port 3001",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3001",
  },
});
