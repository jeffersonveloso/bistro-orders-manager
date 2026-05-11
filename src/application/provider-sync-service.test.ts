import { describe, expect, it } from "vitest";

import type { OrderSyncProviderPort } from "@/src/application/ports";
import { createProviderSyncService } from "@/src/application/provider-sync-service";
import type { ProviderOrderSnapshot } from "@/src/domain/provider-sync";
import { createMockOrderSyncProvider } from "@/src/infrastructure/mock-order-provider";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createSnapshot(
  externalOrderId: string,
  overrides: Partial<ProviderOrderSnapshot> = {},
): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId,
    reference: `Pedido ${externalOrderId}`,
    customerName: "Mesa 7",
    channel: "anota-ai",
    providerStatus: "CONFIRMED",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: "2026-05-11T12:00:00.000Z",
    items: [
      {
        externalItemId: `${externalOrderId}-drink`,
        catalogExternalId: "iced-coffee",
        name: "Café gelado",
        quantity: 1,
        notes: "Sem açúcar",
        modifiers: [],
      },
      {
        externalItemId: `${externalOrderId}-bakery`,
        catalogExternalId: "croissant",
        name: "Croissant",
        quantity: 1,
        modifiers: [],
      },
    ],
    notes: "Mesa lateral",
    rawPayload: { id: externalOrderId },
    ...overrides,
  };
}

function cloneSnapshot(snapshot: ProviderOrderSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as ProviderOrderSnapshot;
}

function createMutableSyncProvider(
  initialSnapshots: ProviderOrderSnapshot[],
): OrderSyncProviderPort & {
  clearFetchFailure(externalOrderId: string): void;
  setFetchFailure(externalOrderId: string, error: Error): void;
  setSnapshot(snapshot: ProviderOrderSnapshot): void;
} {
  const snapshots = new Map(
    initialSnapshots.map((snapshot) => [
      snapshot.externalOrderId,
      cloneSnapshot(snapshot),
    ]),
  );
  const fetchFailures = new Map<string, Error>();

  return {
    providerName() {
      return "anota_ai";
    },
    async fetchOrderById(externalOrderId) {
      const fetchFailure = fetchFailures.get(externalOrderId);

      if (fetchFailure) {
        throw fetchFailure;
      }

      const snapshot = snapshots.get(externalOrderId);

      return snapshot ? cloneSnapshot(snapshot) : null;
    },
    async listConfirmedOrders(input) {
      const updatedSince = input.updatedSince
        ? Date.parse(input.updatedSince)
        : undefined;
      const confirmedSnapshots = [...snapshots.values()]
        .filter((snapshot) => snapshot.lifecycle === "confirmed_ready")
        .filter((snapshot) => {
          if (typeof updatedSince !== "number") {
            return true;
          }

          return Date.parse(snapshot.providerUpdatedAt) >= updatedSince;
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
          if (!item.catalogExternalId) {
            throw new Error(
              `Item "${item.externalItemId}" is missing catalogExternalId`,
            );
          }

          return {
            externalItemId: item.externalItemId,
            menuItemId: item.catalogExternalId,
            name: item.name,
            quantity: item.quantity,
            notes: item.notes,
          };
        }),
      };
    },
    setFetchFailure(externalOrderId, error) {
      fetchFailures.set(externalOrderId, error);
    },
    clearFetchFailure(externalOrderId) {
      fetchFailures.delete(externalOrderId);
    },
    setSnapshot(snapshot) {
      snapshots.set(snapshot.externalOrderId, cloneSnapshot(snapshot));
    },
  };
}

function countRows(
  context: ReturnType<typeof createProductionTestContext>,
  table: string,
) {
  return (
    context.database
      .prepare(`SELECT COUNT(*) as count FROM ${table}`)
      .get() as { count: number }
  ).count;
}

describe("provider sync service", () => {
  it("imports a confirmed order exactly once even when duplicate webhook deliveries are received", async () => {
    const snapshot = createSnapshot("external-duplicate");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const firstResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });
      const duplicateResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      expect(firstResult).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "imported",
        }),
      );
      expect(duplicateResult).toEqual(
        expect.objectContaining({
          runId: null,
          eventId: null,
          status: "completed",
          outcome: "duplicate_ignored",
        }),
      );
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
      expect(countRows(context, "provider_events")).toBe(1);
      expect(countRows(context, "sync_runs")).toBe(1);
      expect(countRows(context, "provider_orders")).toBe(1);
    } finally {
      context.close();
    }
  });

  it("stores provider state for non-confirmed orders without importing production entities", async () => {
    const snapshot = createSnapshot("external-pending", {
      lifecycle: "pending_confirmation",
      providerStatus: "UNDER_REVIEW",
    });
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const result = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-pending",
        eventType: "order.updated",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "ignored",
          orderId: null,
        }),
      );
      expect(context.repository.listOrderAggregates()).toHaveLength(0);
      expect(
        context.repository.getProviderOrder({
          provider: "anota_ai",
          externalOrderId: snapshot.externalOrderId,
        }),
      ).toEqual(
        expect.objectContaining({
          lifecycle: "pending_confirmation",
          importedOrderId: null,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("opens and refreshes ingestion_failed with source event linkage when canonical fetch fails", async () => {
    const provider = createMutableSyncProvider([]);
    provider.setFetchFailure(
      "external-fetch-fail",
      new Error("upstream unavailable"),
    );
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const firstResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-fetch-1",
        eventType: "order.confirmed",
        externalOrderId: "external-fetch-fail",
        payload: { id: "external-fetch-fail" },
      });
      const firstException = context.repository.listUnresolvedSyncExceptions()[0];

      const secondResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-fetch-2",
        eventType: "order.confirmed",
        externalOrderId: "external-fetch-fail",
        payload: { id: "external-fetch-fail" },
      });
      const unresolvedExceptions = context.repository.listUnresolvedSyncExceptions();

      expect(firstResult).toEqual(
        expect.objectContaining({
          status: "failed",
          outcome: "exception_opened",
          exceptionKind: "ingestion_failed",
        }),
      );
      expect(firstException).toEqual(
        expect.objectContaining({
          externalOrderId: "external-fetch-fail",
          sourceEventId: firstResult.eventId,
          kind: "ingestion_failed",
          orderId: null,
        }),
      );
      expect(secondResult).toEqual(
        expect.objectContaining({
          status: "failed",
          outcome: "exception_refreshed",
          exceptionKind: "ingestion_failed",
          exceptionId: firstResult.exceptionId,
        }),
      );
      expect(unresolvedExceptions).toHaveLength(1);
      expect(unresolvedExceptions[0]?.sourceEventId).toBe(secondResult.eventId);
      expect(
        context.database
          .prepare(
            `
              SELECT process_status as processStatus
              FROM provider_events
              ORDER BY received_at ASC
            `,
          )
          .all(),
      ).toEqual([
        { processStatus: "failed" },
        { processStatus: "failed" },
      ]);
    } finally {
      context.close();
    }
  });

  it("opens ingestion_failed when a webhook arrives without externalOrderId", async () => {
    const provider = createMutableSyncProvider([]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const result = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-missing-id",
        eventType: "order.confirmed",
        payload: { kind: "missing-id" },
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failed",
          outcome: "exception_opened",
          externalOrderId: null,
          exceptionKind: "ingestion_failed",
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "ingestion_failed",
          externalOrderId: null,
          sourceEventId: result.eventId,
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("marks replay runs as failed and opens ingestion_failed when the provider no longer returns the order", async () => {
    const provider = createMutableSyncProvider([]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const result = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: "external-not-found",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failed",
          processed: 1,
          imported: 0,
          errorCount: 1,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "ingestion_failed",
          externalOrderId: "external-not-found",
          details: expect.objectContaining({
            errorCode: "provider_order_not_found",
          }),
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("records normalization failures as ingestion_failed during reconciliation", async () => {
    const snapshot = createSnapshot("external-normalization-fail", {
      items: [
        {
          externalItemId: "external-normalization-fail-item",
          catalogExternalId: null,
          name: "Sem external ID",
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const result = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "failed",
          processed: 1,
          imported: 0,
          errorCount: 1,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "ingestion_failed",
          externalOrderId: snapshot.externalOrderId,
          details: expect.objectContaining({
            errorCode: "normalization_failed",
            stage: "normalize",
          }),
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("opens canceled_externally for imported orders without mutating kitchen entities", async () => {
    const snapshot = createSnapshot("external-canceled");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-canceled-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });
      const beforeCancellation = JSON.parse(
        JSON.stringify(context.repository.getOrderAggregate(imported.orderId!)),
      );

      provider.setSnapshot(
        createSnapshot("external-canceled", {
          lifecycle: "canceled",
          providerStatus: "CANCELED",
          providerUpdatedAt: "2026-05-11T12:10:00.000Z",
        }),
      );

      const canceled = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-canceled-2",
        eventType: "order.canceled",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });
      const afterCancellation = context.repository.getOrderAggregate(imported.orderId!);

      expect(canceled).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          exceptionKind: "canceled_externally",
          orderId: imported.orderId,
        }),
      );
      expect(afterCancellation).toEqual(beforeCancellation);
    } finally {
      context.close();
    }
  });

  it("opens changed_externally for modifier or order-note divergence and resolves it when the baseline returns", async () => {
    const baseline = createSnapshot("external-modifiers");
    const provider = createMutableSyncProvider([baseline]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-modifiers-1",
        eventType: "order.confirmed",
        externalOrderId: baseline.externalOrderId,
        payload: { id: baseline.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-modifiers", {
          providerUpdatedAt: "2026-05-11T12:08:00.000Z",
          notes: "Levar talher junto",
          items: [
            {
              externalItemId: "external-modifiers-drink",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 1,
              notes: "Sem açúcar",
              modifiers: [
                {
                  name: "Gelo extra",
                  quantity: 1,
                },
              ],
            },
            {
              externalItemId: "external-modifiers-bakery",
              catalogExternalId: "croissant",
              name: "Croissant",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      const changed = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-modifiers-2",
        eventType: "order.updated",
        externalOrderId: baseline.externalOrderId,
        payload: { id: baseline.externalOrderId },
      });

      expect(changed).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          exceptionKind: "changed_externally",
        }),
      );
      expect(
        context.repository
          .listSyncExceptionsForOrder(imported.orderId!)
          .find((exception) => exception.kind === "changed_externally")?.details,
      ).toEqual(
        expect.objectContaining({
          diffs: expect.arrayContaining([
            expect.objectContaining({ type: "modifiers_changed" }),
            expect.objectContaining({ type: "order_notes_changed" }),
          ]),
        }),
      );

      provider.setSnapshot(
        createSnapshot("external-modifiers", {
          providerUpdatedAt: "2026-05-11T12:12:00.000Z",
        }),
      );

      const reconciled = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: baseline.externalOrderId,
      });

      expect(reconciled).toEqual(
        expect.objectContaining({
          status: "completed",
          resolvedExceptions: 1,
          errorCount: 0,
        }),
      );
      expect(
        context.repository
          .listUnresolvedSyncExceptionsByOrderIds([imported.orderId!])
          .find((exception) => exception.kind === "changed_externally"),
      ).toBeUndefined();
    } finally {
      context.close();
    }
  });

  it("opens changed_externally on production-affecting quantity changes without mutating imported items", async () => {
    const snapshot = createSnapshot("external-changed");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-changed-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-changed", {
          providerUpdatedAt: "2026-05-11T12:06:00.000Z",
          items: [
            {
              externalItemId: "external-changed-drink",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 3,
              notes: "Sem açúcar",
              modifiers: [],
            },
            {
              externalItemId: "external-changed-bakery",
              catalogExternalId: "croissant",
              name: "Croissant",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      const changed = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-changed-2",
        eventType: "order.updated",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });
      const aggregate = context.repository.getOrderAggregate(imported.orderId!);
      const changedException = context.repository
        .listSyncExceptionsForOrder(imported.orderId!)
        .find((exception) => exception.kind === "changed_externally");

      expect(changed).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          exceptionKind: "changed_externally",
        }),
      );
      expect(
        aggregate?.items.find(
          (item) => item.externalItemId === "external-changed-drink",
        )?.quantity,
      ).toBe(1);
      expect(changedException?.details).toEqual(
        expect.objectContaining({
          diffs: expect.arrayContaining([
            expect.objectContaining({
              type: "quantity_changed",
              externalItemId: "external-changed-drink",
            }),
          ]),
        }),
      );
    } finally {
      context.close();
    }
  });

  it("replays successfully after a missing mapping is fixed and resolves missing_mapping", async () => {
    const snapshot = createSnapshot("external-missing-mapping", {
      items: [
        {
          externalItemId: "external-missing-mapping-item",
          catalogExternalId: "new-anota-item",
          name: "Item novo",
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const firstRun = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });

      expect(firstRun).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 0,
          openedExceptions: 1,
          resolvedExceptions: 0,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "missing_mapping",
          externalOrderId: snapshot.externalOrderId,
        }),
      ]);

      context.database
        .prepare(
          `
            INSERT INTO menu_item_kitchen_mappings (
              menu_item_id,
              menu_item_name,
              kitchen_id
            )
            VALUES (?, ?, ?)
          `,
        )
        .run("new-anota-item", "Item novo", "kitchen-2");

      const secondRun = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });

      expect(secondRun).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 1,
          resolvedExceptions: 1,
          errorCount: 0,
        }),
      );
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("resolves ingestion_failed only after a technically successful replay", async () => {
    const snapshot = createSnapshot("external-replay-success");
    const provider = createMutableSyncProvider([snapshot]);
    provider.setFetchFailure(
      snapshot.externalOrderId,
      new Error("temporary upstream failure"),
    );
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const failedRun = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });

      expect(failedRun).toEqual(
        expect.objectContaining({
          status: "failed",
          processed: 1,
          imported: 0,
          errorCount: 1,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "ingestion_failed",
          externalOrderId: snapshot.externalOrderId,
        }),
      ]);

      provider.clearFetchFailure(snapshot.externalOrderId);

      const recoveredRun = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });

      expect(recoveredRun).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 1,
          resolvedExceptions: 1,
          errorCount: 0,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("keeps existing mock imports stable during unchanged reconciliation runs", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const service = createProviderSyncService({
      provider: createMockOrderSyncProvider(),
      repository: context.repository,
    });

    try {
      const before = JSON.parse(
        JSON.stringify(context.repository.listOrderAggregates()),
      );

      const result = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 0,
          ignored: before.length,
          errorCount: 0,
        }),
      );
      expect(context.repository.listOrderAggregates()).toEqual(before);
      expect(countRows(context, "provider_orders")).toBe(before.length);
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });
});
