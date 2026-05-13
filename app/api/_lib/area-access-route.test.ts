import { describe, expect, it } from "vitest";

import { createAreaAccessService } from "@/src/application/area-access-service";
import { jsonNoStore } from "@/app/api/_lib/provider-sync-route";
import {
  type AreaAccessRuntimeConfig,
  signAreaSession,
} from "@/src/infrastructure/area-session";
import {
  withAreaSession,
  withKitchenArea,
  withSalonArea,
} from "@/app/api/_lib/area-access-route";

function createRuntimeConfig(): AreaAccessRuntimeConfig {
  return {
    cookieName: "bistro_area_session",
    pins: {
      "kitchen-1": "1111",
      "kitchen-2": "2222",
      salon: "3333",
    },
    renewalWindowMs: 4 * 60 * 60 * 1000,
    renewalWindowRatio: 0.25,
    secureCookies: false,
    sessionSecret: "route-secret",
    sessionTtlHours: 16,
    sessionTtlMs: 16 * 60 * 60 * 1000,
    sessionTtlSeconds: 16 * 60 * 60,
  };
}

function createCookieHeader(
  config: AreaAccessRuntimeConfig,
  input: {
    areaId: "kitchen-1" | "kitchen-2" | "salon";
    expiresAt?: string;
    issuedAt?: string;
    version?: 1;
  },
) {
  const session = {
    areaId: input.areaId,
    expiresAt: input.expiresAt ?? "2026-05-13T16:00:00.000Z",
    issuedAt: input.issuedAt ?? "2026-05-13T00:00:00.000Z",
    version: input.version ?? 1,
  };

  return `${config.cookieName}=${signAreaSession(session, config)}`;
}

describe("area access route guard helpers", () => {
  it("returns 401 before protected callback work executes when the session is missing", async () => {
    const config = createRuntimeConfig();
    let callbackRuns = 0;

    const response = await withKitchenArea(
      new Request("http://localhost/api/board"),
      () => {
        callbackRuns += 1;
        return jsonNoStore({ ok: true });
      },
      {
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toBe("Unauthorized");
    expect(callbackRuns).toBe(0);
  });

  it("returns 403 before protected callback work executes for wrong-area access", async () => {
    const config = createRuntimeConfig();
    let callbackRuns = 0;

    const response = await withKitchenArea(
      new Request("http://localhost/api/board", {
        headers: {
          cookie: createCookieHeader(config, { areaId: "salon" }),
        },
      }),
      () => {
        callbackRuns += 1;
        return jsonNoStore({ ok: true });
      },
      {
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toBe("Forbidden");
    expect(callbackRuns).toBe(0);
  });

  it("keeps existing route-helper response patterns compatible and renews only after auth succeeds", async () => {
    const config = createRuntimeConfig();
    const areaAccessService = createAreaAccessService(config, () => {
      return new Date("2026-05-13T12:30:00.000Z");
    });

    const response = await withKitchenArea(
      new Request("http://localhost/api/board", {
        headers: {
          cookie: createCookieHeader(config, {
            areaId: "kitchen-1",
            expiresAt: "2026-05-13T16:00:00.000Z",
          }),
        },
      }),
      ({ kitchenId }) => jsonNoStore({ kitchenId }),
      {
        areaAccessService,
        config,
        now: new Date("2026-05-13T12:30:00.000Z"),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain("bistro_area_session=v1.");
    expect(await response.json()).toEqual({ kitchenId: "kitchen-1" });
  });

  it("supports same-session and salon-only flows with the shared helper surface", async () => {
    const config = createRuntimeConfig();

    const sessionResponse = await withAreaSession(
      new Request("http://localhost/api/access-check", {
        headers: {
          cookie: createCookieHeader(config, { areaId: "kitchen-2" }),
        },
      }),
      ({ session }) => jsonNoStore({ areaId: session.areaId }),
      {
        config,
        now: new Date("2026-05-13T10:00:00.000Z"),
      },
    );
    const salonResponse = await withSalonArea(
      new Request("http://localhost/api/salon", {
        headers: {
          cookie: createCookieHeader(config, { areaId: "salon" }),
        },
      }),
      ({ session }) => jsonNoStore({ areaId: session.areaId }),
      {
        config,
        now: new Date("2026-05-13T10:00:00.000Z"),
      },
    );

    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toEqual({ areaId: "kitchen-2" });
    expect(salonResponse.status).toBe(200);
    expect(await salonResponse.json()).toEqual({ areaId: "salon" });
  });

  it("returns a deterministic 503 response when runtime access config is invalid", async () => {
    let callbackRuns = 0;

    const response = await withAreaSession(
      new Request("http://localhost/api/access-check"),
      () => {
        callbackRuns += 1;
        return jsonNoStore({ ok: true });
      },
      {
        env: {
          BISTRO_ACCESS_PIN_KITCHEN_1: "1111",
          BISTRO_ACCESS_PIN_KITCHEN_2: "2222",
          BISTRO_ACCESS_PIN_SALON: "3333",
        },
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toBe(
      "Missing required access configuration: BISTRO_ACCESS_SESSION_SECRET",
    );
    expect(callbackRuns).toBe(0);
  });
});
