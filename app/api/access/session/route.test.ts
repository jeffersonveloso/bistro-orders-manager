import { describe, expect, it } from "vitest";

import { handlePostAccessSession } from "@/app/api/access/session/route";
import { createAreaAccessService } from "@/src/application/area-access-service";
import type { AreaAccessRuntimeConfig } from "@/src/infrastructure/area-session";

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

function createJsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/access/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createHttpsJsonRequest(body: Record<string, unknown>) {
  return new Request("https://bistro.example.com/api/access/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/access/session", () => {
  it("returns 400 when the submitted area id is invalid", async () => {
    const response = await handlePostAccessSession(
      createJsonRequest({
        areaId: "kitchen-9",
        pin: "1111",
      }),
      {
        config: createRuntimeConfig(),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("Invalid access payload");
  });

  it("returns 401 and does not set a cookie when the PIN is wrong", async () => {
    const config = createRuntimeConfig();

    const response = await handlePostAccessSession(
      createJsonRequest({
        areaId: "kitchen-1",
        pin: "9999",
      }),
      {
        areaAccessService: createAreaAccessService(
          config,
          () => new Date("2026-05-13T12:00:00.000Z"),
        ),
        config,
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toBe("Invalid area PIN");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("keeps kitchen sessions on the catalog route when next is allowed", async () => {
    const config = createRuntimeConfig();

    const response = await handlePostAccessSession(
      createJsonRequest({
        areaId: "kitchen-1",
        next: "/catalog",
        pin: "1111",
      }),
      {
        areaAccessService: createAreaAccessService(
          config,
          () => new Date("2026-05-13T12:00:00.000Z"),
        ),
        config,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      areaId: "kitchen-1",
      redirectTo: "/catalog",
    });
    expect(response.headers.get("Set-Cookie")).toContain(
      "bistro_area_session=v1.",
    );
  });

  it("normalizes order detail redirects to the authenticated kitchen", async () => {
    const config = createRuntimeConfig();

    const response = await handlePostAccessSession(
      createJsonRequest({
        areaId: "kitchen-2",
        next: "/orders/order_anota-101",
        pin: "2222",
      }),
      {
        areaAccessService: createAreaAccessService(
          config,
          () => new Date("2026-05-13T12:00:00.000Z"),
        ),
        config,
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      areaId: "kitchen-2",
      redirectTo: "/orders/order_anota-101?kitchen=kitchen-2",
    });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).not.toContain("Secure");
  });

  it("preserves secure cookies for HTTPS JSON logins", async () => {
    const response = await handlePostAccessSession(
      createHttpsJsonRequest({
        areaId: "salon",
        pin: "3333",
      }),
      {
        config: {
          ...createRuntimeConfig(),
          secureCookies: true,
        },
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
  });

  it("returns 503 when runtime access configuration is missing", async () => {
    const response = await handlePostAccessSession(
      createJsonRequest({
        areaId: "salon",
        pin: "3333",
      }),
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
  });
});
