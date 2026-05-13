import { requireSalonPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import type { ProductionRepository } from "@/src/application/ports";
import { getDashboardData } from "@/src/application/production-service";
import { SalonClient } from "@/src/components/kds/salon-client";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const dynamic = "force-dynamic";

export interface SalonPageDependencies extends AreaPageDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function loadSalonPage(
  dependencies: SalonPageDependencies = {},
) {
  await requireSalonPageAccess(dependencies);
  await runReadRefresh(dependencies);

  return {
    initialData: getDashboardData(
      dependencies.repository ?? getProductionRepository(),
    ),
  };
}

export default async function SalonPage() {
  const { initialData } = await loadSalonPage();

  return <SalonClient initialData={initialData} />;
}

async function runReadRefresh(dependencies: SalonPageDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
