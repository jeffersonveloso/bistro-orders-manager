import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function readPlaywrightConfig() {
  return fs.readFileSync(
    path.join(process.cwd(), "playwright.config.ts"),
    "utf8",
  );
}

describe("playwright config", () => {
  it("forces mock provider mode for seeded e2e regression flows", () => {
    const config = readPlaywrightConfig();

    expect(config).toContain("BISTRO_ORDER_SYNC_PROVIDER_MODE=mock");
    expect(config).toContain("data/bistro-production.e2e.sqlite");
    expect(config).toContain("BISTRO_ACCESS_SESSION_SECRET=playwright-session-secret");
    expect(config).toContain("BISTRO_ACCESS_PIN_KITCHEN_1=1111");
    expect(config).toContain("BISTRO_ACCESS_PIN_KITCHEN_2=2222");
    expect(config).toContain("BISTRO_ACCESS_PIN_SALON=3333");
    expect(config).toContain("127.0.0.1 --port 3001");
  });
});
