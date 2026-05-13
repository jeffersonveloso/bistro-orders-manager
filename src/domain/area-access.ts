export const areaIds = ["kitchen-1", "kitchen-2", "salon"] as const;

export type AreaId = (typeof areaIds)[number];

export const kitchenAreaIds = ["kitchen-1", "kitchen-2"] as const;

export type KitchenAreaId = (typeof kitchenAreaIds)[number];

export const AREA_SESSION_VERSION = 1 as const;

export interface AreaSession {
  areaId: AreaId;
  issuedAt: string;
  expiresAt: string;
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

export function isKitchenAreaId(value: string): value is KitchenAreaId {
  return kitchenAreaIds.includes(value as KitchenAreaId);
}

export function isKitchenArea(areaId: AreaId): areaId is KitchenAreaId {
  return areaId === "kitchen-1" || areaId === "kitchen-2";
}

export function getCanonicalAreaPath(areaId: AreaId) {
  return canonicalAreaPaths[areaId];
}
