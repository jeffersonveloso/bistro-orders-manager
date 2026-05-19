import { requireKitchenPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import type { ProductionRepository } from "@/src/application/ports";
import { getDashboardData } from "@/src/application/production-service";
import { DashboardClient } from "@/src/components/kds/dashboard-client";
import {
  isElevatedAccessRole,
  kitchenAreaIds,
} from "@/src/domain/area-access";
import { maybeRefreshRuntimeProviderSync } from "@/src/infrastructure/runtime-provider-sync-refresh";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const dynamic = "force-dynamic";

export interface HomePageDependencies extends AreaPageDependencies {
  refresh?: () => Promise<void> | void;
  repository?: ProductionRepository;
}

export async function loadHomePage(dependencies: HomePageDependencies = {}) {
  const { kitchenId, session } = await requireKitchenPageAccess(dependencies);
  await runReadRefresh(dependencies);
  const hasElevatedAccess = isElevatedAccessRole(session.role);

  return {
    activeKitchenId: kitchenId,
    canAcknowledgeSyncExceptions: hasElevatedAccess,
    canForceLocalCancel: hasElevatedAccess,
    initialData: getDashboardData(
      dependencies.repository ?? getProductionRepository(),
    ),
    managedKitchenIds: hasElevatedAccess ? [...kitchenAreaIds] : [kitchenId],
  };
}

export default async function Home() {
  const {
    activeKitchenId,
    canAcknowledgeSyncExceptions,
    canForceLocalCancel,
    initialData,
    managedKitchenIds,
  } = await loadHomePage();

  return (
    <DashboardClient
      activeKitchenId={activeKitchenId}
      canAcknowledgeSyncExceptions={canAcknowledgeSyncExceptions}
      canForceLocalCancel={canForceLocalCancel}
      initialData={initialData}
      managedKitchenIds={managedKitchenIds}
    />
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
