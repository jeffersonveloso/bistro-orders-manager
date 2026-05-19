export const areaIds = ["kitchen-1", "kitchen-2", "salon"] as const;

export type AreaId = (typeof areaIds)[number];

export const kitchenAreaIds = ["kitchen-1", "kitchen-2"] as const;

export type KitchenAreaId = (typeof kitchenAreaIds)[number];

export const accessRoles = ["station", "manager", "admin"] as const;

export type AccessRole = (typeof accessRoles)[number];

export const elevatedAccessRoles = ["manager", "admin"] as const;

export const AREA_SESSION_VERSION = 1 as const;

export interface AreaSession {
  allowedAreaIds: AreaId[];
  areaId: AreaId;
  issuedAt: string;
  expiresAt: string;
  role: AccessRole;
  version: typeof AREA_SESSION_VERSION;
}

export const canonicalAreaPaths: Record<AreaId, string> = {
  "kitchen-1": "/",
  "kitchen-2": "/",
  salon: "/salon",
};

export function isAreaId(value: string): value is AreaId {
  return areaIds.includes(value as AreaId);
}

export function isAccessRole(value: string): value is AccessRole {
  return accessRoles.includes(value as AccessRole);
}

export function isKitchenAreaId(value: string): value is KitchenAreaId {
  return kitchenAreaIds.includes(value as KitchenAreaId);
}

export function isKitchenArea(areaId: AreaId): areaId is KitchenAreaId {
  return areaId === "kitchen-1" || areaId === "kitchen-2";
}

export function isElevatedAccessRole(role: AccessRole) {
  return elevatedAccessRoles.includes(role as (typeof elevatedAccessRoles)[number]);
}

export function hasAreaAccess(
  session: Pick<AreaSession, "allowedAreaIds">,
  areaId: AreaId,
) {
  return session.allowedAreaIds.includes(areaId);
}

export function canManageKitchenWithSession(
  session: Pick<AreaSession, "areaId" | "role">,
  kitchenId: KitchenAreaId,
) {
  return isElevatedAccessRole(session.role) || session.areaId === kitchenId;
}

export function getCanonicalAreaPath(areaId: AreaId) {
  return canonicalAreaPaths[areaId];
}

export function getCanonicalKitchenOrderPath(
  orderId: string,
  kitchenId: KitchenAreaId,
) {
  return `/orders/${encodeURIComponent(orderId)}?kitchen=${kitchenId}`;
}
