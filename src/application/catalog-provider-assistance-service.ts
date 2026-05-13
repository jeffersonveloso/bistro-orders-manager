import type {
  CatalogAdminProviderPort,
  CatalogExternalIdSupport,
} from "@/src/application/ports";

export function getCatalogExternalIdSupport(
  provider: CatalogAdminProviderPort,
): CatalogExternalIdSupport {
  return provider.getCatalogExternalIdSupport();
}
