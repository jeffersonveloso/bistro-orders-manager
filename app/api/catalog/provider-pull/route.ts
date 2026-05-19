import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withAreaSession,
} from "@/app/api/_lib/area-access-route";
import type { CatalogAdminProviderPort } from "@/src/application/ports";
import {
  previewProviderCatalogPull,
  type CatalogMappingRepository,
} from "@/src/application/catalog-mapping-service";
import { isElevatedAccessRole, isKitchenArea } from "@/src/domain/area-access";
import { createConfiguredCatalogAdminProvider } from "@/src/infrastructure/order-provider-factory";
import { getProductionRepository } from "@/src/infrastructure/sqlite";
import {
  jsonNoStore,
  normalizeOptionalString,
  readJsonObject,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ProviderCatalogPullRouteDependencies
  extends AreaAccessRouteDependencies {
  provider?: CatalogAdminProviderPort;
  repository?: Pick<
    CatalogMappingRepository,
    "listKitchenMappings" | "upsertProviderCatalogItems"
  >;
}

export async function handlePostProviderCatalogPull(
  request: Request,
  dependencies: ProviderCatalogPullRouteDependencies = {},
) {
  const body = await readJsonObject(request, { allowEmpty: true });

  if (!body.ok) {
    return body.response;
  }

  const parsedLimit = parseOptionalPositiveInteger(body.value.limit);
  const updatedSince = normalizeOptionalString(body.value.updatedSince);

  if ("limit" in body.value && parsedLimit === null) {
    return jsonNoStore("Invalid limit", { status: 400 });
  }

  if ("updatedSince" in body.value && !updatedSince) {
    return jsonNoStore("Invalid updatedSince", { status: 400 });
  }

  const provider =
    dependencies.provider ?? createConfiguredCatalogAdminProvider();
  const repository = dependencies.repository ?? getProductionRepository();

  try {
    const result = await previewProviderCatalogPull({
      provider,
      repository,
      limit: parsedLimit ?? undefined,
      updatedSince,
    });

    return jsonNoStore(result);
  } catch (error) {
    return jsonNoStore(
      error instanceof Error
        ? error.message
        : "Failed to pull provider catalog suggestions",
      {
        status: error instanceof TypeError ? 400 : 502,
      },
    );
  }
}

export async function handlePostProviderCatalogPullRoute(
  request: Request,
  dependencies: ProviderCatalogPullRouteDependencies = {},
) {
  return withAreaSession(
    request,
    async ({ session }) => {
      if (
        !isKitchenArea(session.areaId) &&
        !isElevatedAccessRole(session.role)
      ) {
        return forbiddenAreaResponse();
      }

      return handlePostProviderCatalogPull(request, dependencies);
    },
    dependencies,
  );
}

export async function POST(request: Request) {
  return handlePostProviderCatalogPullRoute(request);
}

function parseOptionalPositiveInteger(
  value: unknown,
): number | null | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}
