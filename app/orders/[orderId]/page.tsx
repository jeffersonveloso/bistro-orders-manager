import { notFound, redirect } from "next/navigation";

import { requireKitchenPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import { AreaAuthorizationError } from "@/src/application/area-access-service";
import type { ProductionRepository } from "@/src/application/ports";
import { getOrderDetailData } from "@/src/application/production-service";
import { OrderDetailClient } from "@/src/components/kds/order-detail-client";
import {
  getCanonicalAreaPath,
  getCanonicalKitchenOrderPath,
  isElevatedAccessRole,
  kitchenAreaIds,
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
  const { areaAccessService, kitchenId, session } = await requireKitchenPageAccess(
    dependencies,
  );
  const returnTo = normalizeReturnTo(requestedReturnTo, kitchenId);
  const hasElevatedAccess = isElevatedAccessRole(session.role);
  let focusKitchenId: KitchenAreaId;

  try {
    focusKitchenId = areaAccessService.resolveFocusKitchen(
      session,
      requestedKitchenId,
    );
  } catch (error) {
    if (error instanceof AreaAuthorizationError) {
      redirect(
        appendReturnToParam(
          getCanonicalKitchenOrderPath(orderId, kitchenId),
          returnTo,
        ),
      );
    }

    throw error;
  }

  const repository = dependencies.repository ?? getProductionRepository();
  const aggregate = repository.getOrderAggregate(orderId);

  if (!aggregate) {
    notFound();
  }

  if (!aggregate.tickets.some((ticket) => ticket.kitchenId === focusKitchenId)) {
    redirect(getCanonicalAreaPath(kitchenId));
  }

  await runReadRefresh(dependencies);

  const initialData = getOrderDetailData(repository, orderId, focusKitchenId);

  if (!initialData) {
    notFound();
  }

  if (initialData.focusKitchenId !== focusKitchenId) {
    redirect(getCanonicalAreaPath(kitchenId));
  }

  return {
    canForceLocalCancel: hasElevatedAccess,
    focusKitchenId: initialData.focusKitchenId,
    initialData,
    kitchenId,
    managedKitchenIds: hasElevatedAccess ? [...kitchenAreaIds] : [kitchenId],
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
  const {
    canForceLocalCancel,
    focusKitchenId,
    initialData,
    kitchenId,
    managedKitchenIds,
    orderId,
    returnTo,
  } = await loadOrderPage({
    params,
    searchParams,
  });

  return (
    <OrderDetailClient
      canForceLocalCancel={canForceLocalCancel}
      focusKitchenId={focusKitchenId}
      initialData={initialData}
      kitchenId={kitchenId}
      managedKitchenIds={managedKitchenIds}
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
