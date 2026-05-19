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
import {
  completeTicketProduction,
  startTicketProduction,
} from "@/src/application/production-service";
import {
  hasAreaAccess,
  isElevatedAccessRole,
} from "@/src/domain/area-access";
import { isKitchenId } from "@/src/domain/production";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KitchenTicketRouteDependencies extends AreaAccessRouteDependencies {
  repository?: ProductionRepository;
}

export function handlePatchKitchenTicket(
  repository: ProductionRepository,
  {
    action,
    kitchenId,
    orderId,
  }: {
    action?: string;
    kitchenId: string;
    orderId: string;
  },
) {
  if (!isKitchenId(kitchenId)) {
    return jsonNoStore("Invalid kitchen", { status: 400 });
  }

  if (action !== "start" && action !== "complete") {
    return jsonNoStore("Invalid action", { status: 400 });
  }

  const aggregate = repository.getOrderAggregate(orderId);

  if (!aggregate) {
    return jsonNoStore("Order not found", { status: 404 });
  }

  if (!aggregate.tickets.some((ticket) => ticket.kitchenId === kitchenId)) {
    return jsonNoStore("Kitchen ticket not found", { status: 404 });
  }

  if (action === "start") {
    startTicketProduction(repository, orderId, kitchenId);
  } else {
    completeTicketProduction(repository, orderId, kitchenId);
  }

  return jsonNoStore(
    { ok: true },
  );
}

export async function handlePatchKitchenTicketRoute(
  request: Request,
  {
    kitchenId,
    orderId,
  }: {
    kitchenId: string;
    orderId: string;
  },
  dependencies: KitchenTicketRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async ({ kitchenId: sessionKitchenId, session }) => {
      if (
        isKitchenId(kitchenId) &&
        kitchenId !== sessionKitchenId &&
        (!isElevatedAccessRole(session.role) ||
          !hasAreaAccess(session, kitchenId))
      ) {
        return forbiddenAreaResponse();
      }

      const bodyResult = await readJsonObject(request);

      if (!bodyResult.ok) {
        return bodyResult.response;
      }

      return handlePatchKitchenTicket(
        dependencies.repository ?? getProductionRepository(),
        {
          action:
            typeof bodyResult.value.action === "string"
              ? bodyResult.value.action
              : undefined,
          kitchenId,
          orderId,
        },
      );
    },
    dependencies,
  );
}

export async function PATCH(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ orderId: string; kitchenId: string }>;
  },
) {
  const { orderId, kitchenId } = await params;

  return handlePatchKitchenTicketRoute(request, {
    kitchenId,
    orderId,
  });
}
