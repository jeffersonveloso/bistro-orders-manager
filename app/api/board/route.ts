import type { AreaAccessRouteDependencies } from "@/app/api/_lib/area-access-route";
import { withKitchenArea } from "@/app/api/_lib/area-access-route";
import { jsonNoStore } from "@/app/api/_lib/provider-sync-route";
import type { ProductionRepository } from "@/src/application/ports";
import { getDashboardData } from "@/src/application/production-service";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BoardRouteDependencies extends AreaAccessRouteDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function handleGetBoard(
  request: Request,
  dependencies: BoardRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async () => {
      await runReadRefresh(dependencies);

      return jsonNoStore(
        getDashboardData(
          dependencies.repository ?? getProductionRepository(),
        ),
      );
    },
    dependencies,
  );
}

export async function GET(request: Request) {
  return handleGetBoard(request);
}

async function runReadRefresh(dependencies: BoardRouteDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
