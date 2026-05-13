import { describe, expect, it } from "vitest";

import type { AreaSession } from "@/src/domain/area-access";
import {
  AreaAccessConfigurationError,
  clearAreaSessionCookie,
  createAreaSessionCookie,
  loadAreaAccessRuntimeConfig,
  maybeCreateRenewedAreaSessionCookie,
  readAreaSessionCookieValue,
  signAreaSession,
  verifyAreaSessionFromCookieHeader,
  verifyAreaSessionValue,
} from "@/src/infrastructure/area-session";

function createRuntimeConfig() {
  return {
    cookieName: "bistro_area_session",
    pins: {
      "kitchen-1": "1111",
      "kitchen-2": "2222",
      salon: "3333",
    },
    renewalWindowMs: 4 * 60 * 60 * 1000,
    renewalWindowRatio: 0.25,
    secureCookies: true,
    sessionSecret: "test-secret",
    sessionTtlHours: 16,
    sessionTtlMs: 16 * 60 * 60 * 1000,
    sessionTtlSeconds: 16 * 60 * 60,
  } as const;
}

function createSession(overrides: Partial<AreaSession> = {}): AreaSession {
  return {
    areaId: "kitchen-1",
    expiresAt: "2026-05-13T16:00:00.000Z",
    issuedAt: "2026-05-13T00:00:00.000Z",
    version: 1,
    ...overrides,
  };
}

describe("area session infrastructure", () => {
  it("loads access env config with an explicit default TTL and dev cookie policy", () => {
    const config = loadAreaAccessRuntimeConfig({
      BISTRO_ACCESS_PIN_KITCHEN_1: "1111",
      BISTRO_ACCESS_PIN_KITCHEN_2: "2222",
      BISTRO_ACCESS_PIN_SALON: "3333",
      BISTRO_ACCESS_SESSION_SECRET: "secret",
      NODE_ENV: "development",
    });

    expect(config.sessionTtlHours).toBe(16);
    expect(config.sessionTtlSeconds).toBe(57_600);
    expect(config.renewalWindowMs).toBe(14_400_000);
    expect(config.secureCookies).toBe(false);
  });

  it("fails deterministically when required access env configuration is missing", () => {
    expect(() =>
      loadAreaAccessRuntimeConfig({
        BISTRO_ACCESS_PIN_KITCHEN_1: "1111",
        BISTRO_ACCESS_PIN_KITCHEN_2: "2222",
        BISTRO_ACCESS_PIN_SALON: "3333",
      }),
    ).toThrowError(
      new AreaAccessConfigurationError(
        "Missing required access configuration: BISTRO_ACCESS_SESSION_SECRET",
      ),
    );
  });

  it("fails deterministically when the configured session TTL is invalid", () => {
    expect(() =>
      loadAreaAccessRuntimeConfig({
        BISTRO_ACCESS_PIN_KITCHEN_1: "1111",
        BISTRO_ACCESS_PIN_KITCHEN_2: "2222",
        BISTRO_ACCESS_PIN_SALON: "3333",
        BISTRO_ACCESS_SESSION_SECRET: "secret",
        BISTRO_ACCESS_SESSION_TTL_HOURS: "0",
      }),
    ).toThrowError(
      new AreaAccessConfigurationError(
        "Invalid access configuration: BISTRO_ACCESS_SESSION_TTL_HOURS must be a positive integer",
      ),
    );
  });

  it("serializes the signed session cookie with the approved policy", () => {
    const cookie = createAreaSessionCookie(createSession(), createRuntimeConfig());

    expect(cookie).toContain("bistro_area_session=v1.");
    expect(cookie).toContain("Max-Age=57600");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it("clears the signed session cookie with the same transport policy", () => {
    const cookie = clearAreaSessionCookie({
      cookieName: "bistro_area_session",
      secureCookies: false,
    });

    expect(cookie).toContain("bistro_area_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("reads, verifies, and rejects malformed, expired, or unsupported sessions", () => {
    const config = createRuntimeConfig();
    const validSession = createSession();
    const validValue = signAreaSession(validSession, config);
    const tamperedValue = `${validValue.slice(0, -1)}x`;
    const expiredValue = signAreaSession(
      createSession({ expiresAt: "2026-05-13T09:00:00.000Z" }),
      config,
    );
    const unsupportedVersionValue = signAreaSession(
      {
        ...validSession,
        version: 2 as 1,
      },
      config,
    );

    expect(readAreaSessionCookieValue(`foo=bar; ${config.cookieName}=${validValue}`)).toBe(
      validValue,
    );
    expect(
      verifyAreaSessionValue(validValue, config, new Date("2026-05-13T12:00:00.000Z")),
    ).toEqual({
      ok: true,
      session: validSession,
    });
    expect(
      verifyAreaSessionValue("invalid-envelope", config, new Date("2026-05-13T12:00:00.000Z")),
    ).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(
      verifyAreaSessionValue(tamperedValue, config, new Date("2026-05-13T12:00:00.000Z")),
    ).toEqual({
      ok: false,
      reason: "invalid_signature",
    });
    expect(
      verifyAreaSessionValue(expiredValue, config, new Date("2026-05-13T12:00:00.000Z")),
    ).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(
      verifyAreaSessionValue(
        unsupportedVersionValue,
        config,
        new Date("2026-05-13T12:00:00.000Z"),
      ),
    ).toEqual({
      ok: false,
      reason: "unsupported_version",
    });
    expect(
      verifyAreaSessionFromCookieHeader(
        `${config.cookieName}=${validValue}`,
        config,
        new Date("2026-05-13T12:00:00.000Z"),
      ),
    ).toEqual({
      ok: true,
      session: validSession,
    });
  });

  it("reissues cookies only inside the configured final 25 percent renewal window", () => {
    const config = createRuntimeConfig();
    const session = createSession();

    expect(
      maybeCreateRenewedAreaSessionCookie(
        session,
        config,
        new Date("2026-05-13T11:59:00.000Z"),
      ),
    ).toBeNull();
    expect(
      maybeCreateRenewedAreaSessionCookie(
        session,
        config,
        new Date("2026-05-13T12:01:00.000Z"),
      ),
    ).toContain("bistro_area_session=v1.");
  });
});
