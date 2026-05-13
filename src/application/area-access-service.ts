import {
  AREA_SESSION_VERSION,
  getCanonicalAreaPath,
  getCanonicalKitchenOrderPath,
  isKitchenArea,
  type AreaId,
  type AreaSession,
  type KitchenAreaId,
} from "@/src/domain/area-access";

export interface AreaAccessPolicyConfig {
  pins: Record<AreaId, string>;
  sessionTtlMs: number;
}

export interface AreaAccessService {
  authenticate(areaId: AreaId, pin: string): AreaSession;
  requireKitchenArea(session: AreaSession): KitchenAreaId;
  requireSalonArea(session: AreaSession): void;
  resolveFocusKitchen(
    session: AreaSession,
    requestedKitchenId?: string,
  ): KitchenAreaId;
  resolveNextTarget(session: AreaSession, next?: string): string;
}

export class AreaAuthenticationError extends Error {
  readonly code = "invalid_pin";

  constructor(message = "Invalid area PIN") {
    super(message);
    this.name = "AreaAuthenticationError";
  }
}

export class AreaAuthorizationError extends Error {
  readonly code = "forbidden";

  constructor(message = "Forbidden") {
    super(message);
    this.name = "AreaAuthorizationError";
  }
}

export function createAreaAccessService(
  config: AreaAccessPolicyConfig,
  getNow: () => Date = () => new Date(),
): AreaAccessService {
  return {
    authenticate(areaId, pin) {
      const expectedPin = config.pins[areaId];
      const receivedPin = normalizePin(pin);

      if (!expectedPin || !receivedPin || receivedPin !== expectedPin) {
        throw new AreaAuthenticationError();
      }

      const issuedAt = getNow();
      const expiresAt = new Date(issuedAt.getTime() + config.sessionTtlMs);

      return {
        areaId,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        version: AREA_SESSION_VERSION,
      };
    },

    requireKitchenArea(session) {
      if (!isKitchenArea(session.areaId)) {
        throw new AreaAuthorizationError();
      }

      return session.areaId;
    },

    requireSalonArea(session) {
      if (session.areaId !== "salon") {
        throw new AreaAuthorizationError();
      }
    },

    resolveFocusKitchen(session, requestedKitchenId) {
      const kitchenId = this.requireKitchenArea(session);

      if (
        typeof requestedKitchenId === "string" &&
        requestedKitchenId.length > 0 &&
        requestedKitchenId !== kitchenId
      ) {
        throw new AreaAuthorizationError();
      }

      return kitchenId;
    },

    resolveNextTarget(session, next) {
      const fallbackPath = getCanonicalAreaPath(session.areaId);
      const parsedTarget = parseRelativeTarget(next);

      if (!parsedTarget) {
        return fallbackPath;
      }

      if (session.areaId === "salon") {
        return parsedTarget.pathname === "/salon" &&
          parsedTarget.searchParams.size === 0
          ? "/salon"
          : fallbackPath;
      }

      if (parsedTarget.pathname === "/" && parsedTarget.searchParams.size === 0) {
        return "/";
      }

      if (!/^\/orders\/[^/]+$/.test(parsedTarget.pathname)) {
        return fallbackPath;
      }

      const requestedKitchenId = parsedTarget.searchParams.get("kitchen");

      if (
        [...parsedTarget.searchParams.keys()].some((key) => key !== "kitchen") ||
        (requestedKitchenId && requestedKitchenId !== session.areaId)
      ) {
        return fallbackPath;
      }

      return getCanonicalKitchenOrderPath(
        parsedTarget.pathname.slice("/orders/".length),
        session.areaId,
      );
    },
  };
}

function normalizePin(pin: string) {
  return pin.trim();
}

function parseRelativeTarget(next?: string) {
  if (typeof next !== "string") {
    return null;
  }

  const normalizedTarget = next.trim();

  if (
    normalizedTarget.length === 0 ||
    !normalizedTarget.startsWith("/") ||
    normalizedTarget.startsWith("//")
  ) {
    return null;
  }

  let parsedTarget: URL;

  try {
    parsedTarget = new URL(normalizedTarget, "http://localhost");
  } catch {
    return null;
  }

  if (
    parsedTarget.origin !== "http://localhost" ||
    parsedTarget.hash.length > 0
  ) {
    return null;
  }

  return parsedTarget;
}
