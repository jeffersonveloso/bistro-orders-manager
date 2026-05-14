import { requireKitchenPageAccess, type AreaPageDependencies } from "@/app/_lib/area-access-page";
import { getCatalogExternalIdSupport } from "@/src/application/catalog-provider-assistance-service";
import type { CatalogMappingRepository } from "@/src/application/catalog-mapping-service";
import { getCatalogMappingPageDataFromProvider } from "@/src/application/catalog-mapping-service";
import type { CatalogAdminProviderPort } from "@/src/application/ports";
import { CatalogMappingsClient } from "@/src/components/kds/catalog-mappings-client";
import { createConfiguredCatalogAdminProvider } from "@/src/infrastructure/order-provider-factory";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const dynamic = "force-dynamic";

export interface CatalogPageDependencies extends AreaPageDependencies {
  catalogAdminProvider?: CatalogAdminProviderPort;
  repository?: CatalogMappingRepository;
}

export async function loadCatalogPage(
  dependencies: CatalogPageDependencies = {},
) {
  await requireKitchenPageAccess(dependencies);
  const repository = dependencies.repository ?? getProductionRepository();
  const catalogAdminProvider =
    dependencies.catalogAdminProvider ?? createConfiguredCatalogAdminProvider();

  return {
    initialData: await getCatalogMappingPageDataFromProvider({
      catalogAdminProvider,
      repository,
      providerExternalIdSupport: getCatalogExternalIdSupport(catalogAdminProvider),
    }),
  };
}

export default async function CatalogPage() {
  const { initialData } = await loadCatalogPage();

  return <CatalogMappingsClient initialData={initialData} />;
}
