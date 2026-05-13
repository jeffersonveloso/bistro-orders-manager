import { requireKitchenPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import type { ProductionRepository } from "@/src/application/ports";
import { getDashboardData } from "@/src/application/production-service";
import { DashboardClient } from "@/src/components/kds/dashboard-client";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const dynamic = "force-dynamic";

export interface HomePageDependencies extends AreaPageDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function loadHomePage(dependencies: HomePageDependencies = {}) {
  const { kitchenId } = await requireKitchenPageAccess(dependencies);
  await runReadRefresh(dependencies);

  return {
    activeKitchenId: kitchenId,
    initialData: getDashboardData(
      dependencies.repository ?? getProductionRepository(),
    ),
  };
}

export default async function Home() {
  const { activeKitchenId, initialData } = await loadHomePage();

  return (
    <DashboardClient activeKitchenId={activeKitchenId} initialData={initialData} />
  );
}

async function runReadRefresh(dependencies: HomePageDependencies) {
  const refresh = dependencies.refresh;

  if (refresh) {
    await refresh();
    return;
  }

  await maybeRefreshRuntimeProviderSync(dependencies.env);
}
