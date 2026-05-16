import type { DashboardData } from "@/src/application/production-service";
import type { KitchenAreaId } from "@/src/domain/area-access";

export function collectTrackedKitchenOrderIds(
  board: DashboardData,
  kitchenId: KitchenAreaId,
) {
  const kitchen = board.kitchens.find((entry) => entry.id === kitchenId);

  if (!kitchen) {
    return [];
  }

  const orderIds = new Set<string>();

  for (const column of kitchen.columns) {
    for (const ticket of column.tickets) {
      orderIds.add(ticket.orderId);
    }
  }

  return [...orderIds];
}

export function diffNewTrackedKitchenOrderIds(
  previousOrderIds: readonly string[],
  nextOrderIds: readonly string[],
) {
  const knownOrderIds = new Set(previousOrderIds);

  return nextOrderIds.filter((orderId) => !knownOrderIds.has(orderId));
}

export function mergeTrackedKitchenOrderIds(
  currentOrderIds: readonly string[],
  incomingOrderIds: readonly string[],
) {
  return [...new Set([...currentOrderIds, ...incomingOrderIds])];
}

export function acknowledgeTrackedKitchenOrder(
  currentOrderIds: readonly string[],
  orderId: string,
) {
  return currentOrderIds.filter((entry) => entry !== orderId);
}
