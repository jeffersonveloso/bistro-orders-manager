import { NextResponse } from "next/server";

import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withKitchenArea,
} from "@/app/api/_lib/area-access-route";
import type { ProductionRepository } from "@/src/application/ports";
import {
  completeTicketProduction,
  startTicketProduction,
} from "@/src/application/production-service";
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
    return NextResponse.json("Invalid kitchen", { status: 400 });
  }

  if (action !== "start" && action !== "complete") {
    return NextResponse.json("Invalid action", { status: 400 });
  }

  if (action === "start") {
    startTicketProduction(repository, orderId, kitchenId);
  } else {
    completeTicketProduction(repository, orderId, kitchenId);
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
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
    async ({ kitchenId: sessionKitchenId }) => {
      if (isKitchenId(kitchenId) && kitchenId !== sessionKitchenId) {
        return forbiddenAreaResponse();
      }

      const body = (await request.json()) as { action?: string };

      return handlePatchKitchenTicket(
        dependencies.repository ?? getProductionRepository(),
        {
          action: body.action,
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
