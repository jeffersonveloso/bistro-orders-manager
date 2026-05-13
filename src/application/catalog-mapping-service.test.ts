import { describe, expect, it, vi } from "vitest";

import {
  getCatalogMappingPageData,
  getCatalogMappingPageDataFromProvider,
  previewProviderCatalogPull,
  upsertCatalogMappingAndReplay,
} from "@/src/application/catalog-mapping-service";
import { createProviderSyncService } from "@/src/application/provider-sync-service";
import type {
  CatalogAdminProviderPort,
  OrderSyncProviderPort,
} from "@/src/application/ports";
import type {
  ProviderCatalogItem,
  ProviderOrderSnapshot,
} from "@/src/domain/provider-sync";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createSnapshot(
  externalOrderId: string,
  overrides: Partial<ProviderOrderSnapshot> = {},
): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId,
    reference: `Pedido ${externalOrderId}`,
    customerName: "Mesa 8",
    channel: "anotaai",
    providerStatus: "in_production",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: "2026-05-12T12:00:00.000Z",
    items: [
      {
        externalItemId: `${externalOrderId}-drink`,
        providerItemId: `provider-item-${externalOrderId}-drink`,
        catalogExternalId: "iced-coffee",
        name: "Café gelado",
        quantity: 1,
        modifiers: [],
      },
    ],
    rawPayload: { externalOrderId },
    ...overrides,
  };
}

function cloneSnapshot(snapshot: ProviderOrderSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as ProviderOrderSnapshot;
}

function createMutableSyncProvider(
  initialSnapshots: ProviderOrderSnapshot[],
): OrderSyncProviderPort {
  const snapshots = new Map(
    initialSnapshots.map((snapshot) => [
      snapshot.externalOrderId,
      cloneSnapshot(snapshot),
    ]),
  );

  return {
    providerName() {
      return "anota_ai";
    },
    async fetchOrderById(externalOrderId) {
      const snapshot = snapshots.get(externalOrderId);

      return snapshot ? cloneSnapshot(snapshot) : null;
    },
    async listConfirmedOrders(input) {
      const confirmedSnapshots = [...snapshots.values()]
        .filter((snapshot) => snapshot.lifecycle === "confirmed_ready")
        .filter((snapshot) => {
          if (!input.updatedSince) {
            return true;
          }

          return (
            snapshot.providerUpdatedAt.localeCompare(input.updatedSince) >= 0
          );
        })
        .sort((left, right) =>
          left.providerUpdatedAt.localeCompare(right.providerUpdatedAt),
        )
        .map(cloneSnapshot);

      if (typeof input.limit === "number") {
        return confirmedSnapshots.slice(0, input.limit);
      }

      return confirmedSnapshots;
    },
    toProductionInput(snapshot) {
      return {
        externalId: snapshot.externalOrderId,
        reference: snapshot.reference,
        customerName: snapshot.customerName,
        channel: snapshot.channel,
        createdAt: snapshot.providerUpdatedAt,
        items: snapshot.items.map((item) => {
          const providerRoutingKey = item.catalogExternalId ?? item.providerItemId;

          if (!providerRoutingKey) {
            throw new Error(
              `Item "${item.externalItemId}" is missing catalogExternalId and providerItemId`,
            );
          }

          return {
            externalItemId: item.externalItemId,
            menuItemId: providerRoutingKey,
            providerItemId: item.providerItemId ?? null,
            providerExternalId: item.catalogExternalId ?? null,
            name: item.name,
            notes: item.notes,
            quantity: item.quantity,
          };
        }),
      };
    },
  };
}

function createCatalogItem(
  providerItemId: string,
  name: string,
  overrides: Partial<ProviderCatalogItem> = {},
): ProviderCatalogItem {
  return {
    provider: "anota_ai",
    providerItemId,
    providerExternalId: null,
    name,
    updatedAt: "2026-05-12T12:00:00.000Z",
    rawPayload: { id: providerItemId, name },
    ...overrides,
  };
}

function createMutableCatalogAdminProvider(
  initialItems: ProviderCatalogItem[],
): CatalogAdminProviderPort {
  const items = initialItems.map((item) => JSON.parse(JSON.stringify(item)));

  return {
    providerName() {
      return "anota_ai";
    },
    getCatalogExternalIdSupport() {
      return {
        provider: "anota_ai",
        providerLabel: "Anota AI",
        mode: "manual_assist",
        actionLabel: "Publicar manualmente",
        summary: "Resumo",
        instructions: ["Passo 1"],
      };
    },
    async listCatalogItems(input) {
      const filteredItems = items
        .filter((item) => {
          if (!input.updatedSince) {
            return true;
          }

          return item.updatedAt.localeCompare(input.updatedSince) >= 0;
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      if (typeof input.limit === "number") {
        return filteredItems.slice(0, input.limit);
      }

      return filteredItems;
    },
    async publishExternalId() {
      return {
        status: "skipped" as const,
      };
    },
  };
}

describe("catalog mapping service", () => {
  it("surfaces pending provider items from stored provider snapshots", () => {
    const context = createProductionTestContext();

    try {
      context.repository.upsertProviderOrder({
        provider: "anota_ai",
        externalOrderId: "anota-501",
        providerStatus: "in_production",
        lifecycle: "confirmed_ready",
        snapshotHash: "hash-501",
        snapshot: createSnapshot("anota-501", {
          items: [
            {
              externalItemId: "anota-501-drink",
              providerItemId: "provider-item-iced-coffee",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 1,
              modifiers: [],
            },
            {
              externalItemId: "anota-501-club",
              providerItemId: "provider-item-club-sandwich",
              catalogExternalId: "club-sandwich",
              name: "Club Sandwich",
              quantity: 1,
              modifiers: [],
            },
            {
              externalItemId: "anota-501-mystery",
              providerItemId: "provider-item-cha-surpresa",
              catalogExternalId: null,
              name: "Chá surpresa",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
        lastSeenAt: "2026-05-12T12:00:00.000Z",
        lastAppliedAt: "2026-05-12T12:01:00.000Z",
        importedOrderId: null,
      });

      const data = getCatalogMappingPageData(context.repository);

      expect(data.metrics.totalMappings).toBeGreaterThan(0);
      expect(data.pendingProviderItems).toHaveLength(2);
        expect(data.pendingProviderItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerItemId: "provider-item-club-sandwich",
            providerExternalId: "club-sandwich",
            latestName: "Club Sandwich",
            status: "needs_mapping",
            suggestedMenuItemId: "club-sandwich",
          }),
          expect.objectContaining({
            providerItemId: "provider-item-cha-surpresa",
            providerExternalId: null,
            latestName: "Chá surpresa",
            status: "missing_external_id",
            suggestedMenuItemId: null,
          }),
        ]),
      );
    } finally {
      context.close();
    }
  });

  it("includes provider assistance metadata when the page data is built with a provider capability", () => {
    const context = createProductionTestContext();

    try {
      const data = getCatalogMappingPageData(context.repository, {
        providerExternalIdSupport: {
          provider: "anota_ai",
          providerLabel: "Anota AI",
          mode: "manual_assist",
          actionLabel: "Publicar manualmente",
          summary: "Resumo",
          instructions: ["Passo 1"],
        },
      });

      expect(data.providerExternalIdSupport).toEqual(
        expect.objectContaining({
          provider: "anota_ai",
          mode: "manual_assist",
          actionLabel: "Publicar manualmente",
        }),
      );
    } finally {
      context.close();
    }
  });

  it("hydrates the catalog page data with provider catalog items even before orders exist", async () => {
    const context = createProductionTestContext();
    const catalogAdminProvider = createMutableCatalogAdminProvider([
      createCatalogItem("provider-item-club-sandwich", "Club Sandwich", {
        providerExternalId: "club-sandwich",
        updatedAt: "2026-05-12T12:01:00.000Z",
      }),
      createCatalogItem("provider-item-secret-cake", "Bolo secreto", {
        providerExternalId: null,
        updatedAt: "2026-05-12T12:02:00.000Z",
      }),
    ]);

    try {
      const data = await getCatalogMappingPageDataFromProvider({
        catalogAdminProvider,
        repository: context.repository,
        providerExternalIdSupport: catalogAdminProvider.getCatalogExternalIdSupport(),
      });

      expect(data.pendingProviderItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerItemId: "provider-item-club-sandwich",
            providerExternalId: "club-sandwich",
            latestName: "Club Sandwich",
            status: "needs_mapping",
            seenOrderCount: 0,
          }),
          expect.objectContaining({
            providerItemId: "provider-item-secret-cake",
            providerExternalId: null,
            latestName: "Bolo secreto",
            status: "missing_external_id",
            seenOrderCount: 0,
          }),
        ]),
      );
      expect(data.providerCatalogStatus).toEqual({
        errorMessage: null,
        fetchedItemCount: 2,
        status: "loaded",
      });
    } finally {
      context.close();
    }
  });

  it("surfaces provider catalog failures instead of hiding them silently", async () => {
    const context = createProductionTestContext();
    const catalogAdminProvider: CatalogAdminProviderPort = {
      providerName() {
        return "anota_ai";
      },
      getCatalogExternalIdSupport() {
        return {
          provider: "anota_ai",
          providerLabel: "Anota AI",
          mode: "manual_assist",
          actionLabel: "Publicar manualmente",
          summary: "Resumo",
          instructions: ["Passo 1"],
        };
      },
      async listCatalogItems() {
        throw new Error("catalog path not supported");
      },
      async publishExternalId() {
        return {
          status: "skipped",
        };
      },
    };

    try {
      const data = await getCatalogMappingPageDataFromProvider({
        catalogAdminProvider,
        repository: context.repository,
      });

      expect(data.providerCatalogStatus).toEqual({
        errorMessage: "catalog path not supported",
        fetchedItemCount: 0,
        status: "failed",
      });
    } finally {
      context.close();
    }
  });

  it("builds a manual pull preview from provider catalog items", async () => {
    const provider = createMutableCatalogAdminProvider([
      createCatalogItem("provider-item-iced-coffee", "Café gelado", {
        providerExternalId: "iced-coffee",
        updatedAt: "2026-05-12T12:00:00.000Z",
      }),
      createCatalogItem("provider-item-giant-cookie", "Giant Cookie", {
        providerExternalId: "giant-cookie",
        updatedAt: "2026-05-12T12:01:00.000Z",
      }),
      createCatalogItem("provider-item-sem-external-id", "Item sem external id", {
        providerExternalId: null,
        updatedAt: "2026-05-12T12:02:00.000Z",
      }),
    ]);
    const context = createProductionTestContext();

    try {
      const preview = await previewProviderCatalogPull({
        provider,
        repository: context.repository,
        limit: 20,
        updatedSince: "2026-05-01T00:00:00.000Z",
      });

      expect(preview.catalogItemsScanned).toBe(3);
      expect(preview.metrics.pendingProviderItems).toBe(1);
      expect(preview.metrics.pendingMissingExternalIdItems).toBe(1);
      expect(preview.pendingProviderItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            providerItemId: "provider-item-giant-cookie",
            providerExternalId: "giant-cookie",
            latestName: "Giant Cookie",
            status: "needs_mapping",
          }),
          expect.objectContaining({
            providerItemId: "provider-item-sem-external-id",
            providerExternalId: null,
            latestName: "Item sem external id",
            status: "missing_external_id",
          }),
        ]),
      );
    } finally {
      context.close();
    }
  });

  it("upserts a mapping and replays missing-mapping orders automatically", async () => {
    const provider = createMutableSyncProvider([
      createSnapshot("anota-701", {
        items: [
          {
            externalItemId: "anota-701-new-item",
            providerItemId: "provider-item-new-anota-item",
            catalogExternalId: "new-anota-item",
            name: "Novo Item",
            quantity: 2,
            modifiers: [],
          },
        ],
      }),
    ]);
    const context = createProductionTestContext();
    const syncService = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const missingMappingResult = await syncService.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: "anota-701",
      });

      expect(missingMappingResult.imported).toBe(0);
      expect(
        context.repository
          .listUnresolvedSyncExceptions()
          .some((exception) => exception.kind === "missing_mapping"),
      ).toBe(true);

      const result = await upsertCatalogMappingAndReplay({
        input: {
          kitchenId: "kitchen-2",
          menuItemId: "",
          menuItemName: "Novo Item",
          providerItemId: "provider-item-new-anota-item",
          providerExternalId: "new-anota-item",
        },
        generateMenuItemId: () => "uuid-new-anota-item",
        repository: context.repository,
        syncService,
      });

      expect(result.mapping).toEqual({
        kitchenId: "kitchen-2",
        menuItemId: "uuid-new-anota-item",
        menuItemName: "Novo Item",
        providerItemId: "provider-item-new-anota-item",
        providerExternalId: "new-anota-item",
      });
      expect(result.replay.attemptedCount).toBe(1);
      expect(result.replay.importedOrders).toBe(1);
      expect(result.replay.remainingBlockingExceptions).toBe(0);
      expect(context.repository.getOrderAggregate("order_anota-701")).toBeDefined();
      expect(
        context.repository.getOrderAggregate("order_anota-701")?.items[0]?.menuItemId,
      ).toBe("uuid-new-anota-item");
    } finally {
      context.close();
    }
  });

  it("reuses the same generated provider draft for a repeated missing-external-id item name", async () => {
    const context = createProductionTestContext();
    const syncService = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });

    try {
      const first = await upsertCatalogMappingAndReplay({
        input: {
          kitchenId: "kitchen-1",
          menuItemId: "",
          menuItemName: "Chá surpresa",
          providerItemId: "provider-item-cha-surpresa",
          providerExternalId: "",
          mirrorMenuItemIdToProviderExternalId: true,
        },
        generateMenuItemId: () => "uuid-cha-surpresa",
        repository: context.repository,
        syncService,
      });

      const second = await upsertCatalogMappingAndReplay({
        input: {
          kitchenId: "kitchen-1",
          menuItemId: "",
          menuItemName: "Chá surpresa",
          providerItemId: "provider-item-cha-surpresa",
          providerExternalId: "",
          mirrorMenuItemIdToProviderExternalId: true,
        },
        generateMenuItemId: () => "uuid-different",
        repository: context.repository,
        syncService,
      });

      expect(first.mapping.menuItemId).toBe("uuid-cha-surpresa");
      expect(first.mapping.providerItemId).toBe("provider-item-cha-surpresa");
      expect(first.mapping.providerExternalId).toBe("uuid-cha-surpresa");
      expect(second.mapping.menuItemId).toBe("uuid-cha-surpresa");
      expect(second.mapping.providerItemId).toBe("provider-item-cha-surpresa");
      expect(second.mapping.providerExternalId).toBe("uuid-cha-surpresa");
    } finally {
      context.close();
    }
  });

  it("reuses the existing row by name and persists provider item id instead of duplicating the mapping", async () => {
    const context = createProductionTestContext({
      initialKitchenMappings: [
        {
          kitchenId: "kitchen-2",
          menuItemId: "uuid-club-sandwich",
          menuItemName: "Club Sandwich",
          providerItemId: null,
          providerExternalId: null,
        },
      ],
    });
    const syncService = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });

    try {
      const result = await upsertCatalogMappingAndReplay({
        input: {
          kitchenId: "kitchen-2",
          menuItemId: "",
          menuItemName: "Club Sandwich",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich",
        },
        generateMenuItemId: () => "uuid-should-not-be-used",
        repository: context.repository,
        syncService,
      });

      expect(result.mapping.menuItemId).toBe("uuid-club-sandwich");
      expect(result.mapping.providerItemId).toBe("provider-item-club-sandwich");
      expect(result.mapping.providerExternalId).toBe("club-sandwich");
      expect(
        context.repository.listKitchenMappings().filter((mapping) =>
          mapping.menuItemName === "Club Sandwich"
        ),
      ).toHaveLength(1);
    } finally {
      context.close();
    }
  });

  it("rejects conflicting matches when provider ids and item name point to different rows", async () => {
    const context = createProductionTestContext({
      initialKitchenMappings: [
        {
          kitchenId: "kitchen-1",
          menuItemId: "uuid-a",
          menuItemName: "Club Sandwich",
          providerItemId: null,
          providerExternalId: null,
        },
        {
          kitchenId: "kitchen-2",
          menuItemId: "uuid-b",
          menuItemName: "Outro Item",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich",
        },
      ],
    });
    const syncService = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });

    try {
      await expect(
        upsertCatalogMappingAndReplay({
          input: {
            kitchenId: "kitchen-2",
            menuItemId: "",
            menuItemName: "Club Sandwich",
            providerItemId: "provider-item-club-sandwich",
            providerExternalId: "club-sandwich",
          },
          repository: context.repository,
          syncService,
        }),
      ).rejects.toThrow(/mapping conflict/i);
    } finally {
      context.close();
    }
  });

  it("publishes the generated external id through the provider capability when api_write is enabled", async () => {
    const context = createProductionTestContext();
    const syncService = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });
    const publishExternalId = vi.fn(async () => ({
      status: "published" as const,
      providerMessage: "Publicado",
    }));
    const catalogAdminProvider: CatalogAdminProviderPort = {
      providerName() {
        return "anota_ai";
      },
      getCatalogExternalIdSupport() {
        return {
          provider: "anota_ai",
          providerLabel: "Provider de teste",
          mode: "api_write",
          actionLabel: "Publicar agora",
          summary: "Teste",
          instructions: [],
        };
      },
      async listCatalogItems() {
        return [];
      },
      publishExternalId,
    };

    try {
      const result = await upsertCatalogMappingAndReplay({
        catalogAdminProvider,
        input: {
          kitchenId: "kitchen-1",
          menuItemId: "",
          menuItemName: "Club Sandwich",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "",
          mirrorMenuItemIdToProviderExternalId: true,
          publishProviderExternalId: true,
        },
        generateMenuItemId: () => "uuid-club-sandwich",
        repository: context.repository,
        syncService,
      });

      expect(publishExternalId).toHaveBeenCalledWith({
        providerItemId: "provider-item-club-sandwich",
        externalId: "uuid-club-sandwich",
      });
      expect(result.providerPublication).toEqual({
        providerItemId: "provider-item-club-sandwich",
        externalId: "uuid-club-sandwich",
        status: "published",
        providerMessage: "Publicado",
      });
      expect(result.mapping.providerExternalId).toBe("uuid-club-sandwich");
    } finally {
      context.close();
    }
  });
});
