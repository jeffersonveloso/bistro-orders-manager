import {
  AREA_SESSION_VERSION,
  areaIds,
  getCanonicalAreaPath,
  getCanonicalKitchenOrderPath,
  hasAreaAccess,
  isElevatedAccessRole,
  isKitchenArea,
  isKitchenAreaId,
  type AccessRole,
  type AreaId,
  type AreaSession,
  type KitchenAreaId,
} from "@/src/domain/area-access";

export interface AreaAccessPolicyConfig {
  elevatedPins?: Partial<Record<Extract<AccessRole, "manager" | "admin">, string>>;
  pins: Record<AreaId, string>;
  sessionTtlMs: number;
}

export interface AreaAccessService {
  authenticate(areaId: AreaId, pin: string): AreaSession;
  requireElevatedAccess(
    session: AreaSession,
  ): Extract<AccessRole, "manager" | "admin">;
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
      const receivedPin = normalizePin(pin);
      const elevatedRole = resolveElevatedAccessRole(config, receivedPin);

      if (elevatedRole) {
        return buildAuthenticatedSession({
          areaId,
          getNow,
          role: elevatedRole,
          sessionTtlMs: config.sessionTtlMs,
        });
      }

      const expectedPin = config.pins[areaId];

      if (!expectedPin || !receivedPin || receivedPin !== expectedPin) {
        throw new AreaAuthenticationError();
      }

      return buildAuthenticatedSession({
        areaId,
        getNow,
        role: "station",
        sessionTtlMs: config.sessionTtlMs,
      });
    },

    requireElevatedAccess(session) {
      if (!isElevatedAccessRole(session.role)) {
        throw new AreaAuthorizationError();
      }

      return session.role as Extract<AccessRole, "manager" | "admin">;
    },

    requireKitchenArea(session) {
      if (!isKitchenArea(session.areaId)) {
        throw new AreaAuthorizationError();
      }

      return session.areaId;
    },

    requireSalonArea(session) {
      if (
        session.areaId !== "salon" &&
        (!isElevatedAccessRole(session.role) || !hasAreaAccess(session, "salon"))
      ) {
        throw new AreaAuthorizationError();
      }
    },

    resolveFocusKitchen(session, requestedKitchenId) {
      const kitchenId = this.requireKitchenArea(session);

      if (!requestedKitchenId || requestedKitchenId.length === 0) {
        return kitchenId;
      }

      if (!isKitchenAreaId(requestedKitchenId)) {
        throw new AreaAuthorizationError();
      }

      if (requestedKitchenId === kitchenId) {
        return kitchenId;
      }

      if (
        isElevatedAccessRole(session.role) &&
        hasAreaAccess(session, requestedKitchenId)
      ) {
        return requestedKitchenId;
      }

      throw new AreaAuthorizationError();
    },

    resolveNextTarget(session, next) {
      const fallbackPath = getCanonicalAreaPath(session.areaId);
      const parsedTarget = parseRelativeTarget(next);

      if (!parsedTarget) {
        return fallbackPath;
      }

      if (
        parsedTarget.pathname === "/catalog" &&
        parsedTarget.searchParams.size === 0
      ) {
        return isKitchenArea(session.areaId) || isElevatedAccessRole(session.role)
          ? "/catalog"
          : fallbackPath;
      }

      if (
        parsedTarget.pathname === "/salon" &&
        parsedTarget.searchParams.size === 0
      ) {
        return session.areaId === "salon" ||
          (isElevatedAccessRole(session.role) && hasAreaAccess(session, "salon"))
          ? "/salon"
          : fallbackPath;
      }

      if (session.areaId === "salon") {
        return fallbackPath;
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
        (requestedKitchenId &&
          requestedKitchenId !== session.areaId &&
          (!isElevatedAccessRole(session.role) ||
            !isKitchenAreaId(requestedKitchenId) ||
            !hasAreaAccess(session, requestedKitchenId)))
      ) {
        return fallbackPath;
      }

      return getCanonicalKitchenOrderPath(
        parsedTarget.pathname.slice("/orders/".length),
        requestedKitchenId && isKitchenAreaId(requestedKitchenId)
          ? requestedKitchenId
          : session.areaId,
      );
    },
  };
}

function normalizePin(pin: string) {
  return pin.trim();
}

function resolveElevatedAccessRole(
  config: AreaAccessPolicyConfig,
  receivedPin: string,
): Extract<AccessRole, "manager" | "admin"> | null {
  if (!receivedPin) {
    return null;
  }

  if (config.elevatedPins?.admin === receivedPin) {
    return "admin";
  }

  if (config.elevatedPins?.manager === receivedPin) {
    return "manager";
  }

  return null;
}

function buildAuthenticatedSession({
  areaId,
  getNow,
  role,
  sessionTtlMs,
}: {
  areaId: AreaId;
  getNow: () => Date;
  role: AccessRole;
  sessionTtlMs: number;
}) {
  const issuedAt = getNow();
  const expiresAt = new Date(issuedAt.getTime() + sessionTtlMs);

  return {
    allowedAreaIds: isElevatedAccessRole(role) ? [...areaIds] : [areaId],
    areaId,
    expiresAt: expiresAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    role,
    version: AREA_SESSION_VERSION,
  } satisfies AreaSession;
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
