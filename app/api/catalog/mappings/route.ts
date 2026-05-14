import {
  type AreaAccessRouteDependencies,
  withKitchenArea,
} from "@/app/api/_lib/area-access-route";
import { getCatalogExternalIdSupport } from "@/src/application/catalog-provider-assistance-service";
import type { ProviderSyncService } from "@/src/application/ports";
import type { CatalogAdminProviderPort } from "@/src/application/ports";
import {
  getCatalogMappingPageDataFromProvider,
  type CatalogMappingRepository,
  upsertCatalogMappingAndReplay,
} from "@/src/application/catalog-mapping-service";
import { createConfiguredCatalogAdminProvider } from "@/src/infrastructure/order-provider-factory";
import { getProductionRepository } from "@/src/infrastructure/sqlite";
import {
  createRuntimeProviderSyncService,
  jsonNoStore,
  readJsonObject,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CatalogMappingsRouteDependencies
  extends AreaAccessRouteDependencies {
  catalogAdminProvider?: CatalogAdminProviderPort;
  repository?: CatalogMappingRepository;
  syncService?: ProviderSyncService;
}

export async function handleGetCatalogMappings(
  dependencies: CatalogMappingsRouteDependencies = {},
) {
  const repository = dependencies.repository ?? getProductionRepository();
  const catalogAdminProvider =
    dependencies.catalogAdminProvider ?? createConfiguredCatalogAdminProvider();

  return jsonNoStore(
    await getCatalogMappingPageDataFromProvider({
      catalogAdminProvider,
      repository,
      providerExternalIdSupport: getCatalogExternalIdSupport(catalogAdminProvider),
    }),
  );
}

export async function handlePostCatalogMapping(
  request: Request,
  dependencies: CatalogMappingsRouteDependencies = {},
) {
  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const repository = dependencies.repository ?? getProductionRepository();
  const syncService =
    dependencies.syncService ?? createRuntimeProviderSyncService();
  const catalogAdminProvider =
    dependencies.catalogAdminProvider ?? createConfiguredCatalogAdminProvider();

  try {
    const result = await upsertCatalogMappingAndReplay({
      catalogAdminProvider,
      input: {
        kitchenId: body.value.kitchenId,
        menuItemId: body.value.menuItemId,
        menuItemName: body.value.menuItemName,
        providerItemId: body.value.providerItemId,
        providerExternalId: body.value.providerExternalId,
        mirrorMenuItemIdToProviderExternalId:
          body.value.mirrorMenuItemIdToProviderExternalId,
        publishProviderExternalId: body.value.publishProviderExternalId,
      },
      repository,
      syncService,
    });

    return jsonNoStore(result);
  } catch (error) {
    if (error instanceof TypeError) {
      return jsonNoStore(error.message, { status: 400 });
    }

    if (error instanceof Error) {
      return jsonNoStore(error.message, { status: 502 });
    }

    return jsonNoStore("Falha ao salvar mapping no provider.", {
      status: 502,
    });
  }
}

export async function handleGetCatalogMappingsRoute(
  request: Request,
  dependencies: CatalogMappingsRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async () => {
      return handleGetCatalogMappings(dependencies);
    },
    dependencies,
  );
}

export async function handlePostCatalogMappingRoute(
  request: Request,
  dependencies: CatalogMappingsRouteDependencies = {},
) {
  return withKitchenArea(
    request,
    async () => {
      return handlePostCatalogMapping(request, dependencies);
    },
    dependencies,
  );
}

export async function GET(request: Request) {
  return handleGetCatalogMappingsRoute(request);
}

export async function POST(request: Request) {
  return handlePostCatalogMappingRoute(request);
}
