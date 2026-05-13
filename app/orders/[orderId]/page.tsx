import { notFound, redirect } from "next/navigation";

import { requireKitchenPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import type { ProductionRepository } from "@/src/application/ports";
import { getOrderDetailData } from "@/src/application/production-service";
import { OrderDetailClient } from "@/src/components/kds/order-detail-client";
import {
  getCanonicalAreaPath,
  getCanonicalKitchenOrderPath,
  type KitchenAreaId,
} from "@/src/domain/area-access";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const dynamic = "force-dynamic";

export interface OrderPageDependencies extends AreaPageDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function loadOrderPage(
  {
    params,
    searchParams,
  }: {
    params: Promise<{ orderId: string }>;
    searchParams: Promise<{
      kitchen?: string | string[];
      returnTo?: string | string[];
    }>;
  },
  dependencies: OrderPageDependencies = {},
) {
  const { orderId } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedKitchenId = readFirstSearchParam(resolvedSearchParams.kitchen);
  const requestedReturnTo = readFirstSearchParam(resolvedSearchParams.returnTo);
  const { kitchenId } = await requireKitchenPageAccess(dependencies);
  const returnTo = normalizeReturnTo(requestedReturnTo, kitchenId);

  if (requestedKitchenId !== kitchenId) {
    redirect(
      appendReturnToParam(getCanonicalKitchenOrderPath(orderId, kitchenId), returnTo),
    );
  }

  const repository = dependencies.repository ?? getProductionRepository();
  const aggregate = repository.getOrderAggregate(orderId);

  if (!aggregate) {
    notFound();
  }

  if (!aggregate.tickets.some((ticket) => ticket.kitchenId === kitchenId)) {
    redirect(getCanonicalAreaPath(kitchenId));
  }

  await runReadRefresh(dependencies);

  const initialData = getOrderDetailData(repository, orderId, kitchenId);

  if (!initialData) {
    notFound();
  }

  if (initialData.focusKitchenId !== kitchenId) {
    redirect(getCanonicalAreaPath(kitchenId));
  }

  return {
    initialData,
    kitchenId,
    orderId,
    returnTo,
  };
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ kitchen?: string | string[]; returnTo?: string | string[] }>;
}) {
  const { initialData, kitchenId, orderId, returnTo } = await loadOrderPage(
    {
      params,
      searchParams,
    },
  );

  return (
    <OrderDetailClient
      initialData={initialData}
      kitchenId={kitchenId}
      orderId={orderId}
      returnTo={returnTo}
    />
  );
}

function readFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeReturnTo(value: string | undefined, kitchenId: KitchenAreaId) {
  const fallbackPath = getCanonicalAreaPath(kitchenId);

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallbackPath;
  }

  return value;
}

function appendReturnToParam(path: string, returnTo: string) {
  const separator = path.includes("?") ? "&" : "?";
  const searchParams = new URLSearchParams({ returnTo });

  return `${path}${separator}${searchParams.toString()}`;
}

async function runReadRefresh(dependencies: OrderPageDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
