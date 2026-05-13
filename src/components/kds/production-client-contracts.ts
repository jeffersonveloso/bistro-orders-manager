import type {
  BoardKitchenData,
  DashboardData,
  OrderDetailData,
  SalonData,
} from "@/src/application/production-service";
import type { KitchenAreaId } from "@/src/domain/area-access";
import {
  fetchJson,
  getProtectedRouteFeedback,
  type ProtectedRouteFeedback,
} from "@/src/lib/fetch-json";

export const boardQueryKey = ["board"] as const;
export const orderQueryRootKey = ["order"] as const;
export const salonQueryKey = ["salon"] as const;

export function canManageKitchen(
  activeKitchenId: KitchenAreaId,
  kitchenId: KitchenAreaId,
) {
  return activeKitchenId === kitchenId;
}

export function getBoardQueryOptions(initialData?: DashboardData) {
  return {
    initialData,
    queryFn: fetchBoard,
    queryKey: boardQueryKey,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
  } as const;
}

export function getDashboardInvalidationKeys(
  orderId: string,
  kitchenId: KitchenAreaId,
) {
  return [boardQueryKey, getOrderDetailQueryKey(orderId, kitchenId)] as const;
}

export function getOrderDetailQueryKey(
  orderId: string,
  kitchenId: KitchenAreaId,
) {
  return [...orderQueryRootKey, orderId, kitchenId] as const;
}

export function getOrderDetailQueryOptions({
  initialData,
  kitchenId,
  orderId,
}: {
  initialData?: OrderDetailData;
  kitchenId: KitchenAreaId;
  orderId: string;
}) {
  return {
    initialData,
    queryFn: () => fetchOrderDetail(orderId, kitchenId),
    queryKey: getOrderDetailQueryKey(orderId, kitchenId),
    refetchInterval: 2_500,
    refetchIntervalInBackground: true,
  } as const;
}

export function getProtectedSurfaceFeedback(
  error: unknown,
): ProtectedRouteFeedback | null {
  return getProtectedRouteFeedback(error);
}

export function getSalonInvalidationKeys() {
  return [salonQueryKey] as const;
}

export function getSalonQueryOptions(initialData?: SalonData) {
  return {
    initialData,
    queryFn: fetchSalon,
    queryKey: salonQueryKey,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
  } as const;
}

export function hasAuthorizedOrderAccess(
  board: DashboardData,
  activeKitchenId: KitchenAreaId,
  orderId: string | null,
) {
  if (!orderId) {
    return false;
  }

  const activeKitchen = board.kitchens.find(
    (kitchen) => kitchen.id === activeKitchenId,
  );

  if (!activeKitchen) {
    return false;
  }

  return activeKitchen.columns.some((column) =>
    column.tickets.some((ticket) => ticket.orderId === orderId),
  );
}

export function prioritizeKitchens(
  kitchens: BoardKitchenData[],
  activeKitchenId: KitchenAreaId,
) {
  const activeKitchen = kitchens.find((kitchen) => kitchen.id === activeKitchenId);

  if (!activeKitchen) {
    return kitchens;
  }

  return [
    activeKitchen,
    ...kitchens.filter((kitchen) => kitchen.id !== activeKitchenId),
  ];
}

async function fetchBoard() {
  return fetchJson<DashboardData>("/api/board");
}

async function fetchOrderDetail(orderId: string, kitchenId: KitchenAreaId) {
  return fetchJson<OrderDetailData>(`/api/orders/${orderId}?kitchen=${kitchenId}`);
}

async function fetchSalon() {
  return fetchJson<SalonData>("/api/salon");
}
