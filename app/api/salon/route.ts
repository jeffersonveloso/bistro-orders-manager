import type { AreaAccessRouteDependencies } from "@/app/api/_lib/area-access-route";
import { withSalonArea } from "@/app/api/_lib/area-access-route";
import { jsonNoStore } from "@/app/api/_lib/provider-sync-route";
import type { ProductionRepository } from "@/src/application/ports";
import { getSalonData } from "@/src/application/production-service";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SalonRouteDependencies extends AreaAccessRouteDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function handleGetSalon(
  request: Request,
  dependencies: SalonRouteDependencies = {},
) {
  return withSalonArea(
    request,
    async () => {
      await runReadRefresh(dependencies);

      return jsonNoStore(
        getSalonData(
          dependencies.repository ?? getProductionRepository(),
        ),
      );
    },
    dependencies,
  );
}

export async function GET(request: Request) {
  return handleGetSalon(request);
}

async function runReadRefresh(dependencies: SalonRouteDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
