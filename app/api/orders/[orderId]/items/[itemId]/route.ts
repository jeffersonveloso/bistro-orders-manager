import { NextResponse } from "next/server";

import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withKitchenArea,
} from "@/app/api/_lib/area-access-route";
import type { ProductionRepository } from "@/src/application/ports";
import { setOrderItemStatus } from "@/src/application/production-service";
import { itemStatuses } from "@/src/domain/production";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrderItemRouteDependencies extends AreaAccessRouteDependencies {
  repository?: ProductionRepository;
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
    return NextResponse.json("Invalid status", { status: 400 });
  }

  try {
    setOrderItemStatus(
      repository,
      orderId,
      itemId,
      status as "new" | "in_preparation" | "ready",
    );

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(String(error), { status: 404 });
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
      const item = repository
        .getOrderAggregate(orderId)
        ?.items.find((candidate) => candidate.id === itemId);

      if (item && item.kitchenId !== kitchenId) {
        return forbiddenAreaResponse();
      }

      const body = (await request.json()) as { status?: string };

      return handlePatchOrderItem(repository, {
        itemId,
        orderId,
        status: body.status,
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
