import type {
  OrderProviderPort,
  ProductionRepository,
} from "@/src/application/ports";
import {
  MissingKitchenMappingError,
  splitProviderOrder,
} from "@/src/domain/split-order-service";

export interface SyncOrdersResult {
  imported: number;
  skipped: Array<{
    externalId: string;
    reference: string;
    reason: "missing_kitchen_mapping";
    providerExternalId: string;
    menuItemName: string;
  }>;
}

export function syncOrders(
  repository: ProductionRepository,
  provider: OrderProviderPort,
  limit?: number,
): SyncOrdersResult {
  const importedIds = new Set(repository.listImportedExternalOrderIds());
  const rawOrders = provider
    .listOrders()
    .filter((order) => !importedIds.has(order.externalId));

  const nextOrders =
    typeof limit === "number" ? rawOrders.slice(0, limit) : rawOrders;

  const mappings = repository.listKitchenMappings();
  let imported = 0;
  const skipped: SyncOrdersResult["skipped"] = [];

  for (const rawOrder of nextOrders) {
    try {
      repository.saveImportedOrder(splitProviderOrder(rawOrder, mappings));
      imported += 1;
    } catch (error) {
      if (error instanceof MissingKitchenMappingError) {
        skipped.push({
          externalId: rawOrder.externalId,
          reference: rawOrder.reference,
          reason: "missing_kitchen_mapping",
          providerExternalId: error.providerExternalId,
          menuItemName: error.menuItemName,
        });
        continue;
      }

      throw error;
    }
  }

  return {
    imported,
    skipped,
  };
}
