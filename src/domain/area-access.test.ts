import { describe, expect, it } from "vitest";

import {
  getCanonicalAreaPath,
  isAreaId,
  isKitchenArea,
  isKitchenAreaId,
} from "@/src/domain/area-access";

describe("area access domain policy", () => {
  it("returns the canonical surface for each area", () => {
    expect(getCanonicalAreaPath("kitchen-1")).toBe("/");
    expect(getCanonicalAreaPath("kitchen-2")).toBe("/");
    expect(getCanonicalAreaPath("salon")).toBe("/salon");
  });

  it("keeps kitchen and salon identity helpers isolated from production.ts", () => {
    expect(isAreaId("kitchen-1")).toBe(true);
    expect(isAreaId("salon")).toBe(true);
    expect(isAreaId("manager")).toBe(false);
    expect(isKitchenAreaId("kitchen-2")).toBe(true);
    expect(isKitchenAreaId("salon")).toBe(false);
    expect(isKitchenArea("kitchen-1")).toBe(true);
    expect(isKitchenArea("salon")).toBe(false);
  });
});
