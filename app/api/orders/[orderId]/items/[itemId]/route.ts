import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withKitchenArea,
} from "@/app/api/_lib/area-access-route";
import {
  jsonNoStore,
  readJsonObject,
} from "@/app/api/_lib/provider-sync-route";
import type { ProductionRepository } from "@/src/application/ports";
import { setOrderItemStatus } from "@/src/application/production-service";
import { itemStatuses } from "@/src/domain/production";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrderItemRouteDependencies extends AreaAccessRouteDependencies {
  repository?: ProductionRepository;
}

function isOrderItemNotFoundError(error: unknown, itemId: string) {
  return (
    error instanceof Error && error.message === `Order item "${itemId}" not found`
  );
}

export function handlePatchOrderItem(
  repository: ProductionRepository,
  {
    itemId,
    orderId,
    status,
  }: {
    itemId: string;
    orderId: string;
    status?: string;
  },
) {
  if (!status || !itemStatuses.includes(status as (typeof itemStatuses)[number])) {
    return jsonNoStore("Invalid status", { status: 400 });
  }

  const aggregate = repository.getOrderAggregate(orderId);

  if (!aggregate) {
    return jsonNoStore("Order not found", { status: 404 });
  }

  if (!aggregate.items.some((candidate) => candidate.id === itemId)) {
    return jsonNoStore("Order item not found", { status: 404 });
  }

  try {
    setOrderItemStatus(
      repository,
      orderId,
      itemId,
      status as "new" | "in_preparation" | "ready",
    );

    return jsonNoStore(
      { ok: true },
    );
  } catch (error) {
    if (isOrderItemNotFoundError(error, itemId)) {
      return jsonNoStore("Order item not found", { status: 404 });
    }

    return jsonNoStore("Internal server error", { status: 500 });
  }
}

export async function handlePatchOrderItemRoute(
  request: Request,
  {
    itemId,
    orderId,
  }: {
    itemId: string;
    orderId: string;
  },
  dependencies: OrderItemRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async ({ kitchenId }) => {
      const repository = dependencies.repository ?? getProductionRepository();
      const aggregate = repository.getOrderAggregate(orderId);

      if (!aggregate) {
        return jsonNoStore("Order not found", { status: 404 });
      }

      const item = aggregate.items.find((candidate) => candidate.id === itemId);

      if (!item) {
        return jsonNoStore("Order item not found", { status: 404 });
      }

      if (item.kitchenId !== kitchenId) {
        return forbiddenAreaResponse();
      }

      const bodyResult = await readJsonObject(request);

      if (!bodyResult.ok) {
        return bodyResult.response;
      }

      return handlePatchOrderItem(repository, {
        itemId,
        orderId,
        status:
          typeof bodyResult.value.status === "string"
            ? bodyResult.value.status
            : undefined,
      });
    },
    dependencies,
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ orderId: string; itemId: string }>;
  },
) {
  const { orderId, itemId } = await params;

  return handlePatchOrderItemRoute(request, {
    itemId,
    orderId,
  });
}
