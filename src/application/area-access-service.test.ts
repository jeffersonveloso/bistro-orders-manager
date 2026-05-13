import { describe, expect, it } from "vitest";

import {
  AreaAuthenticationError,
  AreaAuthorizationError,
  createAreaAccessService,
} from "@/src/application/area-access-service";

function createService() {
  return createAreaAccessService(
    {
      pins: {
        "kitchen-1": "1111",
        "kitchen-2": "2222",
        salon: "3333",
      },
      sessionTtlMs: 16 * 60 * 60 * 1000,
    },
    () => new Date("2026-05-13T08:00:00.000Z"),
  );
}

describe("area access service", () => {
  it("authenticates an area PIN and creates a shift-length session", () => {
    const session = createService().authenticate("kitchen-1", "1111");

    expect(session).toEqual({
      areaId: "kitchen-1",
      expiresAt: "2026-05-14T00:00:00.000Z",
      issuedAt: "2026-05-13T08:00:00.000Z",
      version: 1,
    });
  });

  it("rejects an invalid area PIN", () => {
    expect(() => createService().authenticate("kitchen-1", "9999")).toThrow(
      AreaAuthenticationError,
    );
  });

  it("enforces kitchen and salon policy helpers", () => {
    const service = createService();
    const kitchenSession = service.authenticate("kitchen-2", "2222");
    const salonSession = service.authenticate("salon", "3333");

    expect(service.requireKitchenArea(kitchenSession)).toBe("kitchen-2");
    expect(() => service.requireKitchenArea(salonSession)).toThrow(
      AreaAuthorizationError,
    );
    expect(() => service.requireSalonArea(kitchenSession)).toThrow(
      AreaAuthorizationError,
    );
    expect(() => service.requireSalonArea(salonSession)).not.toThrow();
  });

  it("normalizes kitchen focus and blocks cross-kitchen detail access", () => {
    const service = createService();
    const kitchenSession = service.authenticate("kitchen-1", "1111");

    expect(service.resolveFocusKitchen(kitchenSession)).toBe("kitchen-1");
    expect(
      service.resolveFocusKitchen(kitchenSession, "kitchen-1"),
    ).toBe("kitchen-1");
    expect(() =>
      service.resolveFocusKitchen(kitchenSession, "kitchen-2"),
    ).toThrow(AreaAuthorizationError);
  });

  it("resolves next targets against the canonical per-area allowlist", () => {
    const service = createService();
    const kitchenSession = service.authenticate("kitchen-1", "1111");
    const salonSession = service.authenticate("salon", "3333");

    expect(service.resolveNextTarget(kitchenSession)).toBe("/");
    expect(service.resolveNextTarget(kitchenSession, "/")).toBe("/");
    expect(
      service.resolveNextTarget(kitchenSession, "/orders/order-101"),
    ).toBe("/orders/order-101?kitchen=kitchen-1");
    expect(
      service.resolveNextTarget(
        kitchenSession,
        "/orders/order-101?kitchen=kitchen-1",
      ),
    ).toBe("/orders/order-101?kitchen=kitchen-1");
    expect(
      service.resolveNextTarget(
        kitchenSession,
        "/orders/order-101?kitchen=kitchen-2",
      ),
    ).toBe("/");
    expect(service.resolveNextTarget(kitchenSession, "/catalog")).toBe("/");
    expect(service.resolveNextTarget(kitchenSession, "https://evil.test")).toBe(
      "/",
    );
    expect(service.resolveNextTarget(salonSession, "/salon")).toBe("/salon");
    expect(service.resolveNextTarget(salonSession, "/orders/order-101")).toBe(
      "/salon",
    );
  });
});
