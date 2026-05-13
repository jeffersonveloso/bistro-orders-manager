import type { AreaAccessRouteDependencies } from "@/app/api/_lib/area-access-route";
import {
  forbiddenAreaResponse,
  withKitchenArea,
} from "@/app/api/_lib/area-access-route";
import { jsonNoStore } from "@/app/api/_lib/provider-sync-route";
import { AreaAuthorizationError } from "@/src/application/area-access-service";
import type { ProductionRepository } from "@/src/application/ports";
import { getOrderDetailData } from "@/src/application/production-service";
import type { KitchenAreaId } from "@/src/domain/area-access";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface OrderDetailRouteDependencies extends AreaAccessRouteDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function handleGetOrderDetail(
  request: Request,
  {
    orderId,
  }: {
    orderId: string;
  },
  dependencies: OrderDetailRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async ({ areaAccessService, session }) => {
      const url = new URL(request.url);
      const requestedKitchenId = url.searchParams.get("kitchen") ?? undefined;

      let focusKitchenId: KitchenAreaId;

      try {
        focusKitchenId = areaAccessService.resolveFocusKitchen(
          session,
          requestedKitchenId,
        );
      } catch (error) {
        if (error instanceof AreaAuthorizationError) {
          return forbiddenAreaResponse();
        }

        throw error;
      }

      await runReadRefresh(dependencies);

      const data = getOrderDetailData(
        dependencies.repository ?? getProductionRepository(),
        orderId,
        focusKitchenId,
      );

      if (!data) {
        return jsonNoStore("Order not found", { status: 404 });
      }

      if (data.focusKitchenId !== focusKitchenId) {
        return forbiddenAreaResponse();
      }

      return jsonNoStore(data);
    },
    dependencies,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;

  return handleGetOrderDetail(request, { orderId });
}

async function runReadRefresh(dependencies: OrderDetailRouteDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
