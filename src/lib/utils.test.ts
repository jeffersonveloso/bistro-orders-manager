import { describe, expect, it } from "vitest";

import { formatOperationalDateTime, formatOperationalTime } from "@/src/lib/utils";

describe("operational date formatting", () => {
  it("formats clock values in the fixed São Paulo operational timezone", () => {
    expect(
      formatOperationalTime("2026-05-13T12:34:56.000Z"),
    ).toBe("09:34");
    expect(
      formatOperationalTime("2026-05-13T12:34:56.000Z", {
        includeSeconds: true,
      }),
    ).toBe("09:34:56");
  });

  it("formats date-time values in the fixed São Paulo operational timezone", () => {
    expect(
      formatOperationalDateTime("2026-05-13T12:34:56.000Z"),
    ).toContain("13/05/2026");
    expect(
      formatOperationalDateTime("2026-05-13T12:34:56.000Z"),
    ).toContain("09:34:56");
  });
});
