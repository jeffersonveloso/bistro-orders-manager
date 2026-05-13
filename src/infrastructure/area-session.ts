import crypto from "node:crypto";

import type { AreaAccessPolicyConfig } from "@/src/application/area-access-service";
import {
  AREA_SESSION_VERSION,
  isAreaId,
  type AreaSession,
} from "@/src/domain/area-access";

const DEFAULT_SESSION_TTL_HOURS = 16;
const SESSION_RENEWAL_WINDOW_RATIO = 0.25;

export const areaAccessCookieName = "bistro_area_session";

export interface AreaAccessRuntimeConfig extends AreaAccessPolicyConfig {
  cookieName: string;
  renewalWindowMs: number;
  renewalWindowRatio: number;
  secureCookies: boolean;
  sessionSecret: string;
  sessionTtlHours: number;
  sessionTtlSeconds: number;
}

export type AreaSessionVerificationFailureReason =
  | "expired"
  | "invalid_signature"
  | "malformed"
  | "missing"
  | "unsupported_version";

export type AreaSessionVerificationResult =
  | {
      ok: true;
      session: AreaSession;
    }
  | {
      ok: false;
      reason: AreaSessionVerificationFailureReason;
    };

export class AreaAccessConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AreaAccessConfigurationError";
  }
}

export function loadAreaAccessRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): AreaAccessRuntimeConfig {
  const sessionSecret = readRequiredEnv(
    env,
    "BISTRO_ACCESS_SESSION_SECRET",
  );
  const kitchen1Pin = readRequiredEnv(env, "BISTRO_ACCESS_PIN_KITCHEN_1");
  const kitchen2Pin = readRequiredEnv(env, "BISTRO_ACCESS_PIN_KITCHEN_2");
  const salonPin = readRequiredEnv(env, "BISTRO_ACCESS_PIN_SALON");
  const sessionTtlHours = readSessionTtlHours(
    env.BISTRO_ACCESS_SESSION_TTL_HOURS,
  );
  const sessionTtlSeconds = sessionTtlHours * 60 * 60;
  const sessionTtlMs = sessionTtlSeconds * 1000;

  return {
    cookieName: areaAccessCookieName,
    pins: {
      "kitchen-1": kitchen1Pin,
      "kitchen-2": kitchen2Pin,
      salon: salonPin,
    },
    renewalWindowMs: Math.floor(sessionTtlMs * SESSION_RENEWAL_WINDOW_RATIO),
    renewalWindowRatio: SESSION_RENEWAL_WINDOW_RATIO,
    secureCookies: env.NODE_ENV !== "development",
    sessionSecret,
    sessionTtlHours,
    sessionTtlMs,
    sessionTtlSeconds,
  };
}

export function signAreaSession(
  session: AreaSession,
  config: Pick<AreaAccessRuntimeConfig, "sessionSecret">,
) {
  const payloadSegment = encodeBase64Url(JSON.stringify(session));
  const unsignedValue = `v1.${payloadSegment}`;
  const signatureSegment = createSignature(unsignedValue, config.sessionSecret);

  return `${unsignedValue}.${signatureSegment}`;
}

export function verifyAreaSessionValue(
  rawValue: string | undefined,
  config: Pick<AreaAccessRuntimeConfig, "sessionSecret">,
  now: Date = new Date(),
): AreaSessionVerificationResult {
  if (!rawValue) {
    return { ok: false, reason: "missing" };
  }

  const segments = rawValue.split(".");

  if (segments.length !== 3) {
    return { ok: false, reason: "malformed" };
  }

  const [versionSegment, payloadSegment, signatureSegment] = segments;

  if (versionSegment !== "v1") {
    return { ok: false, reason: "unsupported_version" };
  }

  const expectedSignature = createSignature(
    `${versionSegment}.${payloadSegment}`,
    config.sessionSecret,
  );

  if (!signaturesMatch(expectedSignature, signatureSegment)) {
    return { ok: false, reason: "invalid_signature" };
  }

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(decodeBase64Url(payloadSegment));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const parsedSession = parseAreaSession(parsedPayload);

  if (!parsedSession.ok) {
    return {
      ok: false,
      reason:
        parsedSession.reason === "unsupported_version"
          ? "unsupported_version"
          : "malformed",
    };
  }

  if (Date.parse(parsedSession.session.expiresAt) <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, session: parsedSession.session };
}

export function readAreaSessionCookieValue(
  cookieHeader: string | null | undefined,
  cookieName = areaAccessCookieName,
) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmedPart = part.trim();

    if (!trimmedPart.startsWith(`${cookieName}=`)) {
      continue;
    }

    const rawValue = trimmedPart.slice(cookieName.length + 1);

    return rawValue.length > 0 ? rawValue : undefined;
  }

  return undefined;
}

export function verifyAreaSessionFromCookieHeader(
  cookieHeader: string | null | undefined,
  config: Pick<AreaAccessRuntimeConfig, "cookieName" | "sessionSecret">,
  now: Date = new Date(),
) {
  return verifyAreaSessionValue(
    readAreaSessionCookieValue(cookieHeader, config.cookieName),
    config,
    now,
  );
}

export function createAreaSessionCookie(
  session: AreaSession,
  config: Pick<
    AreaAccessRuntimeConfig,
    "cookieName" | "secureCookies" | "sessionSecret" | "sessionTtlSeconds"
  >,
) {
  return serializeCookie(config.cookieName, signAreaSession(session, config), {
    httpOnly: true,
    maxAge: config.sessionTtlSeconds,
    path: "/",
    sameSite: "Lax",
    secure: config.secureCookies,
  });
}

export function clearAreaSessionCookie(
  config: Pick<AreaAccessRuntimeConfig, "cookieName" | "secureCookies"> = {
    cookieName: areaAccessCookieName,
    secureCookies: true,
  },
) {
  return serializeCookie(config.cookieName, "", {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: config.secureCookies,
  });
}

export function shouldRenewAreaSession(
  session: AreaSession,
  config: Pick<AreaAccessRuntimeConfig, "renewalWindowMs">,
  now: Date = new Date(),
) {
  const remainingMs = Date.parse(session.expiresAt) - now.getTime();

  return remainingMs > 0 && remainingMs <= config.renewalWindowMs;
}

export function renewAreaSession(
  session: AreaSession,
  config: Pick<AreaAccessRuntimeConfig, "sessionTtlMs">,
  now: Date = new Date(),
): AreaSession {
  return {
    areaId: session.areaId,
    expiresAt: new Date(now.getTime() + config.sessionTtlMs).toISOString(),
    issuedAt: now.toISOString(),
    version: AREA_SESSION_VERSION,
  };
}

export function maybeCreateRenewedAreaSessionCookie(
  session: AreaSession,
  config: Pick<
    AreaAccessRuntimeConfig,
    | "cookieName"
    | "renewalWindowMs"
    | "secureCookies"
    | "sessionSecret"
    | "sessionTtlMs"
    | "sessionTtlSeconds"
  >,
  now: Date = new Date(),
) {
  if (!shouldRenewAreaSession(session, config, now)) {
    return null;
  }

  return createAreaSessionCookie(renewAreaSession(session, config, now), config);
}

function readRequiredEnv(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  if (!value) {
    throw new AreaAccessConfigurationError(
      `Missing required access configuration: ${key}`,
    );
  }

  return value;
}

function readSessionTtlHours(value: string | undefined) {
  if (typeof value === "undefined") {
    return DEFAULT_SESSION_TTL_HOURS;
  }

  const normalizedValue = value.trim();
  const parsedValue = Number.parseInt(normalizedValue, 10);

  if (
    normalizedValue.length === 0 ||
    !Number.isInteger(parsedValue) ||
    parsedValue <= 0
  ) {
    throw new AreaAccessConfigurationError(
      "Invalid access configuration: BISTRO_ACCESS_SESSION_TTL_HOURS must be a positive integer",
    );
  }

  return parsedValue;
}

function createSignature(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function signaturesMatch(expectedSignature: string, receivedSignature: string) {
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const receivedBuffer = Buffer.from(receivedSignature, "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function parseAreaSession(value: unknown):
  | { ok: true; session: AreaSession }
  | { ok: false; reason: "malformed" | "unsupported_version" } {
  if (!isPlainObject(value)) {
    return { ok: false, reason: "malformed" };
  }

  const areaId = value.areaId;
  const issuedAt = value.issuedAt;
  const expiresAt = value.expiresAt;
  const version = value.version;

  if (version !== AREA_SESSION_VERSION) {
    return { ok: false, reason: "unsupported_version" };
  }

  if (
    typeof areaId !== "string" ||
    !isAreaId(areaId) ||
    typeof issuedAt !== "string" ||
    typeof expiresAt !== "string" ||
    Number.isNaN(Date.parse(issuedAt)) ||
    Number.isNaN(Date.parse(expiresAt)) ||
    Date.parse(issuedAt) > Date.parse(expiresAt)
  ) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    session: {
      areaId,
      expiresAt,
      issuedAt,
      version,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    expires?: Date;
    httpOnly?: boolean;
    maxAge?: number;
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
  },
) {
  const parts = [`${name}=${value}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
