import { describe, expect, it } from "vitest";

import {
  createProviderOrderReference,
  parseProviderOrderLifecycle,
  parseSyncTrigger,
  syncExceptionStatuses,
} from "@/src/domain/provider-sync";

describe("provider sync domain contracts", () => {
  it("exposes the stable exception lifecycle statuses", () => {
    expect(syncExceptionStatuses).toEqual([
      "open",
      "acknowledged",
      "resolved",
    ]);
  });

  it("parses valid trigger and lifecycle values for phase 1 sync flows", () => {
    expect(parseSyncTrigger("webhook")).toBe("webhook");
    expect(parseSyncTrigger(" reconciliation ")).toBe("reconciliation");
    expect(parseProviderOrderLifecycle("confirmed_ready")).toBe(
      "confirmed_ready",
    );
    expect(parseProviderOrderLifecycle("canceled")).toBe("canceled");
  });

  it("rejects invalid or missing provider-scoped identifiers", () => {
    expect(() =>
      createProviderOrderReference({
        provider: undefined,
        externalOrderId: "external-1",
      }),
    ).toThrowError("provider must be a supported provider identifier");

    expect(() =>
      createProviderOrderReference({
        provider: "mock",
        externalOrderId: "external-1",
      }),
    ).toThrowError("provider must be a supported provider identifier");

    expect(() =>
      createProviderOrderReference({
        provider: "anota_ai",
        externalOrderId: "   ",
      }),
    ).toThrowError("externalOrderId is required");
  });
});
