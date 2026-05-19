import { describe, expect, it } from "vitest";

import type { OrderSyncProviderPort } from "@/src/application/ports";
import {
  getDashboardData,
  getOrderDetailData,
} from "@/src/application/production-service";
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
  clearListFailure(): void;
  clearFetchFailure(externalOrderId: string): void;
  setFetchFailure(externalOrderId: string, error: Error): void;
  setListFailure(error: Error): void;
  setSnapshot(snapshot: ProviderOrderSnapshot): void;
} {
  const snapshots = new Map(
    initialSnapshots.map((snapshot) => [
      snapshot.externalOrderId,
      cloneSnapshot(snapshot),
    ]),
  );
  const fetchFailures = new Map<string, Error>();
  let listFailure: Error | null = null;

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
      if (listFailure) {
        throw listFailure;
      }

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
    setListFailure(error) {
      listFailure = error;
    },
    clearListFailure() {
      listFailure = null;
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

function atTime(hour: number, minute: number, second = 0) {
  return new Date(Date.UTC(2026, 4, 11, hour, minute, second)).toISOString();
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

  it("retries duplicate webhook deliveries when the persisted event previously failed", async () => {
    const snapshot = createSnapshot("external-duplicate-retry");
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
      const firstResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-retry",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.clearFetchFailure(snapshot.externalOrderId);

      const retryResult = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-retry",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });
      const persistedEvent = context.database
        .prepare(
          `
            SELECT
              id,
              process_status as processStatus,
              sync_run_id as syncRunId
            FROM provider_events
            WHERE provider = ? AND delivery_key = ?
          `,
        )
        .get("anota_ai", "delivery-retry") as {
        id: string;
        processStatus: string;
        syncRunId: string | null;
      };

      expect(firstResult).toEqual(
        expect.objectContaining({
          status: "failed",
          outcome: "exception_opened",
          exceptionKind: "ingestion_failed",
        }),
      );
      expect(retryResult).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "imported",
          eventId: firstResult.eventId,
        }),
      );
      expect(retryResult.runId).not.toBe(firstResult.runId);
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
      expect(countRows(context, "provider_events")).toBe(1);
      expect(countRows(context, "sync_runs")).toBe(2);
      expect(persistedEvent).toEqual({
        id: firstResult.eventId,
        processStatus: "processed",
        syncRunId: retryResult.runId,
      });
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

  it("imports a confirmed order by provider item id when the provider order line has no external id", async () => {
    const snapshot = createSnapshot("external-provider-item-fallback", {
      items: [
        {
          externalItemId: "external-provider-item-fallback-item",
          providerItemId: "provider-item-cappuccino",
          catalogExternalId: null,
          name: "Cappuccino italiano 190ml",
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext({
      initialKitchenMappings: [
        {
          kitchenId: "kitchen-1",
          menuItemId: "uuid-cappuccino",
          menuItemName: "Cappuccino italiano 190ml",
          providerItemId: "provider-item-cappuccino",
          providerExternalId: null,
        },
      ],
    });
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const result = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });

      expect(result).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 1,
          openedExceptions: 0,
        }),
      );
      const importedOrder = context.repository
        .listOrderAggregates()
        .find((aggregate) => aggregate.order.id === `order_${snapshot.externalOrderId}`);
      expect(importedOrder?.items[0]?.menuItemId).toBe("uuid-cappuccino");
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
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

  it("reconciles imported orders that disappeared from confirmed listings and opens canceled_externally", async () => {
    const snapshot = createSnapshot("external-reconcile-canceled");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-reconcile-canceled-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-reconcile-canceled", {
          lifecycle: "canceled",
          providerStatus: "CANCELED",
          providerUpdatedAt: "2026-05-11T12:10:00.000Z",
        }),
      );

      const reconciled = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
      });

      expect(reconciled).toEqual(
        expect.objectContaining({
          status: "completed",
          processed: 1,
          openedExceptions: 1,
          errorCount: 0,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "canceled_externally",
          externalOrderId: snapshot.externalOrderId,
          orderId: imported.orderId,
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("opens canceled_externally for imported orders even when the canceled snapshot can no longer be normalized for production", async () => {
    const snapshot = createSnapshot("external-webhook-canceled");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-webhook-canceled-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-webhook-canceled", {
          lifecycle: "canceled",
          providerStatus: "CANCELED",
          providerUpdatedAt: "2026-05-11T12:09:00.000Z",
          items: [
            {
              externalItemId: "external-webhook-canceled-drink",
              catalogExternalId: null,
              name: "Café gelado",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      const canceled = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-webhook-canceled-2",
        eventType: "order.canceled",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId, check: 4 },
      });

      expect(canceled).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          exceptionKind: "canceled_externally",
          orderId: imported.orderId,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "canceled_externally",
          externalOrderId: snapshot.externalOrderId,
          orderId: imported.orderId,
        }),
      ]);
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

  it("applies changed_externally additions to the local order and reopens the affected kitchen", async () => {
    const snapshot = createSnapshot("external-apply-added-item");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-apply-added-item-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      context.repository.startKitchenTicket(imported.orderId!, "kitchen-1");
      context.repository.completeKitchenTicket(imported.orderId!, "kitchen-1");

      provider.setSnapshot(
        createSnapshot("external-apply-added-item", {
          providerUpdatedAt: "2026-05-11T12:07:00.000Z",
          items: [
            {
              externalItemId: "external-apply-added-item-drink",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 1,
              notes: "Sem açúcar",
              modifiers: [],
            },
            {
              externalItemId: "external-apply-added-item-juice",
              catalogExternalId: "orange-juice",
              name: "Suco de laranja",
              quantity: 1,
              modifiers: [],
            },
            {
              externalItemId: "external-apply-added-item-bakery",
              catalogExternalId: "croissant",
              name: "Croissant",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-apply-added-item-2",
        eventType: "order.updated",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      const changedException = context.repository
        .listSyncExceptionsForOrder(imported.orderId!)
        .find((exception) => exception.kind === "changed_externally");

      if (!changedException) {
        throw new Error("Expected changed_externally exception before applying");
      }

      await service.applyChangedException({
        appliedVia: "manager_apply",
        exceptionId: changedException.id,
        orderId: imported.orderId!,
      });

      const aggregate = context.repository.getOrderAggregate(imported.orderId!);
      const dashboard = getDashboardData(context.repository);
      const detail = getOrderDetailData(
        context.repository,
        imported.orderId!,
        "kitchen-1",
      );
      const kitchen1Preparing = dashboard.kitchens
        .find((kitchen) => kitchen.id === "kitchen-1")
        ?.columns.find((column) => column.status === "in_preparation")
        ?.tickets.find((ticket) => ticket.orderId === imported.orderId);

      expect(
        aggregate?.items.map((item) => ({
          externalItemId: item.externalItemId,
          kitchenId: item.kitchenId,
          name: item.name,
          providerAddedAt: item.providerAddedAt,
          quantity: item.quantity,
          status: item.status,
        })),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            externalItemId: "external-apply-added-item-drink",
            kitchenId: "kitchen-1",
            status: "ready",
          }),
          expect.objectContaining({
            externalItemId: "external-apply-added-item-juice",
            kitchenId: "kitchen-1",
            name: "Suco de laranja",
            providerAddedAt: expect.any(String),
            quantity: 1,
            status: "new",
          }),
          expect.objectContaining({
            externalItemId: "external-apply-added-item-bakery",
            kitchenId: "kitchen-2",
            status: "new",
          }),
        ]),
      );
      expect(
        context.repository
          .listSyncExceptionsForOrder(imported.orderId!)
          .find((exception) => exception.id === changedException.id)?.status,
      ).toBe("resolved");
      expect(kitchen1Preparing).toEqual(
        expect.objectContaining({
          syncExceptionLabel: null,
          ticketStatus: "in_preparation",
          orderId: imported.orderId,
          currentItems: expect.arrayContaining([
            expect.objectContaining({
              name: "Suco de laranja",
              externalStatus: expect.objectContaining({
                kind: "changed",
                label: "Adicionado depois",
              }),
            }),
          ]),
        }),
      );
      expect(detail?.focusItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Suco de laranja",
            externalStatus: expect.objectContaining({
              kind: "changed",
              label: "Adicionado depois",
              detail: "Item incluído no pedido no provedor após a importação.",
            }),
          }),
        ]),
      );
    } finally {
      context.close();
    }
  });

  it("keeps removed provider items visible as externally canceled after applying the change", async () => {
    const snapshot = createSnapshot("external-apply-removed-item");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-apply-removed-item-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-apply-removed-item", {
          providerUpdatedAt: "2026-05-11T12:08:00.000Z",
          items: [
            {
              externalItemId: "external-apply-removed-item-bakery",
              catalogExternalId: "croissant",
              name: "Croissant",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-apply-removed-item-2",
        eventType: "order.updated",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      const changedException = context.repository
        .listSyncExceptionsForOrder(imported.orderId!)
        .find((exception) => exception.kind === "changed_externally");

      if (!changedException) {
        throw new Error("Expected changed_externally exception before applying");
      }

      await service.applyChangedException({
        appliedVia: "manager_apply",
        exceptionId: changedException.id,
        orderId: imported.orderId!,
      });

      const aggregate = context.repository.getOrderAggregate(imported.orderId!);
      const detail = getOrderDetailData(
        context.repository,
        imported.orderId!,
        "kitchen-1",
      );
      const kitchen1Card = getDashboardData(context.repository).kitchens
        .find((kitchen) => kitchen.id === "kitchen-1")
        ?.columns.flatMap((column) => column.tickets)
        .find((ticket) => ticket.orderId === imported.orderId);

      expect(
        aggregate?.items.map((item) => ({
          externalItemId: item.externalItemId,
          providerRemovedAt: item.providerRemovedAt,
          status: item.status,
        })),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            externalItemId: "external-apply-removed-item-drink",
            providerRemovedAt: expect.any(String),
            status: "new",
          }),
          expect.objectContaining({
            externalItemId: "external-apply-removed-item-bakery",
            providerRemovedAt: null,
            status: "new",
          }),
        ]),
      );
      expect(
        context.repository
          .listSyncExceptionsForOrder(imported.orderId!)
          .find((exception) => exception.id === changedException.id)?.status,
      ).toBe("resolved");
      expect(kitchen1Card).toEqual(
        expect.objectContaining({
          syncExceptionLabel: null,
          currentItems: [
            expect.objectContaining({
              name: "Café gelado",
              externalStatus: expect.objectContaining({
                kind: "canceled",
                label: "Cancelado",
                detail: "Item removido do pedido no provedor.",
              }),
            }),
          ],
        }),
      );
      expect(detail?.focusItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "Café gelado",
            externalStatus: expect.objectContaining({
              kind: "canceled",
              label: "Cancelado",
            }),
          }),
        ]),
      );
    } finally {
      context.close();
    }
  });

  it("keeps imported item names bound to the original provider payload even when mappings or cached catalog names change later", async () => {
    const snapshot = createSnapshot("external-payload-names", {
      items: [
        {
          externalItemId: "external-payload-names-drink",
          catalogExternalId: "iced-coffee",
          name: "Café gelado do payload",
          quantity: 1,
          notes: "Sem açúcar",
          modifiers: [],
        },
        {
          externalItemId: "external-payload-names-bakery",
          catalogExternalId: "croissant",
          name: "Croissant amanteigado do payload",
          quantity: 1,
          modifiers: [],
        },
      ],
    });
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext({
      initialKitchenMappings: [
        {
          kitchenId: "kitchen-1",
          menuItemId: "local-iced-coffee-id",
          menuItemName: "Café antigo no mapping",
          providerExternalId: "iced-coffee",
        },
        {
          kitchenId: "kitchen-2",
          menuItemId: "local-croissant-id",
          menuItemName: "Croissant antigo no mapping",
          providerExternalId: "croissant",
        },
      ],
    });
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      context.repository.upsertProviderCatalogItems([
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-iced-coffee",
          providerExternalId: "iced-coffee",
          name: "Café antigo no cache",
          description: "Descrição antiga do cache.",
          updatedAt: "2026-05-11T11:50:00.000Z",
          rawPayload: { id: "catalog-item-iced-coffee", version: 1 },
        },
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-croissant",
          providerExternalId: "croissant",
          name: "Croissant antigo no cache",
          description: "Descrição antiga do cache.",
          updatedAt: "2026-05-11T11:51:00.000Z",
          rawPayload: { id: "catalog-item-croissant", version: 1 },
        },
      ]);

      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-payload-names-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      expect(
        context.repository
          .getOrderAggregate(imported.orderId!)
          ?.items.find(
            (item) => item.externalItemId === "external-payload-names-drink",
          ),
      ).toEqual(
        expect.objectContaining({
          menuItemId: "local-iced-coffee-id",
          name: "Café gelado do payload",
          notes: "Sem açúcar",
        }),
      );
      expect(
        context.repository
          .getOrderAggregate(imported.orderId!)
          ?.items.find(
            (item) => item.externalItemId === "external-payload-names-bakery",
          ),
      ).toEqual(
        expect.objectContaining({
          menuItemId: "local-croissant-id",
          name: "Croissant amanteigado do payload",
        }),
      );

      context.repository.upsertKitchenMapping({
        kitchenId: "kitchen-1",
        menuItemId: "local-iced-coffee-id",
        menuItemName: "Café renomeado no mapping",
        providerExternalId: "iced-coffee",
      });
      context.repository.upsertKitchenMapping({
        kitchenId: "kitchen-2",
        menuItemId: "local-croissant-id",
        menuItemName: "Croissant renomeado no mapping",
        providerExternalId: "croissant",
      });
      context.repository.upsertProviderCatalogItems([
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-iced-coffee",
          providerExternalId: "iced-coffee",
          name: "Café renomeado no cache",
          description: "Descrição nova no cache.",
          updatedAt: "2026-05-11T12:09:00.000Z",
          rawPayload: { id: "catalog-item-iced-coffee", version: 2 },
        },
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-croissant",
          providerExternalId: "croissant",
          name: "Croissant renomeado no cache",
          description: "Descrição nova no cache.",
          updatedAt: "2026-05-11T12:09:30.000Z",
          rawPayload: { id: "catalog-item-croissant", version: 2 },
        },
      ]);
      provider.setSnapshot(
        createSnapshot("external-payload-names", {
          providerUpdatedAt: "2026-05-11T12:10:00.000Z",
          items: [
            {
              externalItemId: "external-payload-names-drink",
              catalogExternalId: "iced-coffee",
              name: "Café gelado do payload",
              quantity: 1,
              notes: "Sem açúcar",
              modifiers: [],
            },
            {
              externalItemId: "external-payload-names-bakery",
              catalogExternalId: "croissant",
              name: "Croissant amanteigado do payload",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      const replay = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        externalOrderId: snapshot.externalOrderId,
      });
      const aggregateAfterReplay = context.repository.getOrderAggregate(
        imported.orderId!,
      );

      expect(replay).toEqual(
        expect.objectContaining({
          status: "completed",
          imported: 0,
          errorCount: 0,
        }),
      );
      expect(
        aggregateAfterReplay?.items.find(
          (item) => item.externalItemId === "external-payload-names-drink",
        )?.name,
      ).toBe("Café gelado do payload");
      expect(
        aggregateAfterReplay?.items.find(
          (item) => item.externalItemId === "external-payload-names-bakery",
        )?.name,
      ).toBe("Croissant amanteigado do payload");
    } finally {
      context.close();
    }
  });

  it("detects item removal by routing key when Anota reuses the same line identifier for multiple items", async () => {
    const snapshot = createSnapshot("external-duplicate-line-ids", {
      items: [
        {
          externalItemId: "0",
          catalogExternalId: "iced-coffee",
          name: "Café gelado",
          quantity: 1,
          modifiers: [],
        },
        {
          externalItemId: "0",
          catalogExternalId: "croissant",
          name: "Croissant",
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
      const imported = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-duplicate-line-ids-1",
        eventType: "order.confirmed",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("external-duplicate-line-ids", {
          providerUpdatedAt: "2026-05-11T12:09:00.000Z",
          items: [
            {
              externalItemId: "0",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 1,
              modifiers: [],
            },
          ],
        }),
      );

      const changed = await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-duplicate-line-ids-2",
        eventType: "order.updated",
        externalOrderId: snapshot.externalOrderId,
        payload: { id: snapshot.externalOrderId },
      });

      expect(changed).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          exceptionKind: "changed_externally",
          orderId: imported.orderId,
        }),
      );
      expect(
        context.repository
          .listSyncExceptionsForOrder(imported.orderId!)
          .find((exception) => exception.kind === "changed_externally")?.details,
      ).toEqual(
        expect.objectContaining({
          diffs: expect.arrayContaining([
            expect.objectContaining({
              type: "item_removed",
              matchKey: "route:croissant",
              before: expect.objectContaining({
                menuItemId: "croissant",
                name: "Croissant",
              }),
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

  it("scopes replay candidates to the reconciliation window and remaining limit budget", async () => {
    const staleSnapshot = createSnapshot("external-replay-stale", {
      providerUpdatedAt: atTime(12, 0),
    });
    const recentSnapshot = createSnapshot("external-replay-recent", {
      providerUpdatedAt: atTime(12, 15),
    });
    const newestSnapshot = createSnapshot("external-replay-newest", {
      providerUpdatedAt: atTime(12, 20),
    });
    const provider = createMutableSyncProvider([
      staleSnapshot,
      recentSnapshot,
      newestSnapshot,
    ]);
    const context = createProductionTestContext();
    let currentNow = atTime(12, 0, 1);
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
      now: () => currentNow,
    });

    try {
      currentNow = atTime(12, 0, 1);
      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-replay-stale",
        eventType: "order.confirmed",
        externalOrderId: staleSnapshot.externalOrderId,
        payload: { id: staleSnapshot.externalOrderId },
      });
      currentNow = atTime(12, 15, 1);
      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-replay-recent",
        eventType: "order.confirmed",
        externalOrderId: recentSnapshot.externalOrderId,
        payload: { id: recentSnapshot.externalOrderId },
      });
      currentNow = atTime(12, 20, 1);
      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-replay-newest",
        eventType: "order.confirmed",
        externalOrderId: newestSnapshot.externalOrderId,
        payload: { id: newestSnapshot.externalOrderId },
      });

      for (const snapshot of [
        staleSnapshot,
        recentSnapshot,
        newestSnapshot,
      ]) {
        provider.setSnapshot(
          createSnapshot(snapshot.externalOrderId, {
            lifecycle: "canceled",
            providerStatus: "CANCELED",
            providerUpdatedAt: atTime(12, 45),
          }),
        );
      }

      currentNow = atTime(12, 30);
      const reconciled = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
        updatedSince: atTime(12, 10),
        limit: 1,
      });

      expect(reconciled).toEqual(
        expect.objectContaining({
          status: "completed",
          processed: 1,
          openedExceptions: 1,
          errorCount: 0,
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "canceled_externally",
          externalOrderId: newestSnapshot.externalOrderId,
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("bounds replay safety-net work and advances through the historical backlog across runs", async () => {
    const totalImportedOrders = 60;
    const snapshots = Array.from({ length: totalImportedOrders }, (_, index) =>
      createSnapshot(`external-bounded-${index}`, {
        providerUpdatedAt: atTime(12, index),
      }),
    );
    const provider = createMutableSyncProvider(snapshots);
    const context = createProductionTestContext();
    let currentNow = atTime(12, 0, 1);
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
      now: () => currentNow,
    });

    try {
      for (const [index, snapshot] of snapshots.entries()) {
        currentNow = atTime(12, index, 1);
        await service.handleWebhook({
          provider: "anota_ai",
          deliveryKey: `delivery-bounded-${index}`,
          eventType: "order.confirmed",
          externalOrderId: snapshot.externalOrderId,
          payload: { id: snapshot.externalOrderId },
        });
        provider.setSnapshot(
          createSnapshot(snapshot.externalOrderId, {
            lifecycle: "canceled",
            providerStatus: "CANCELED",
            providerUpdatedAt: atTime(13, index),
          }),
        );
      }

      currentNow = atTime(14, 0);
      const reconciled = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
      });
      const unresolvedExceptions = context.repository.listUnresolvedSyncExceptions();

      expect(reconciled).toEqual(
        expect.objectContaining({
          status: "completed",
          processed: 50,
          openedExceptions: 50,
          errorCount: 0,
        }),
      );
      expect(unresolvedExceptions).toHaveLength(50);
      expect(
        unresolvedExceptions.some(
          (exception) => exception.externalOrderId === "external-bounded-0",
        ),
      ).toBe(true);
      expect(
        unresolvedExceptions.some(
          (exception) => exception.externalOrderId === "external-bounded-59",
        ),
      ).toBe(false);

      currentNow = atTime(14, 5);
      const replayedBacklog = await service.reconcileConfirmedOrders({
        provider: "anota_ai",
      });
      const replayedBacklogExceptions =
        context.repository.listUnresolvedSyncExceptions();

      expect(replayedBacklog).toEqual(
        expect.objectContaining({
          status: "completed",
          processed: 50,
          openedExceptions: 50,
          errorCount: 0,
        }),
      );
      expect(replayedBacklogExceptions).toHaveLength(60);
      expect(
        replayedBacklogExceptions.some(
          (exception) => exception.externalOrderId === "external-bounded-59",
        ),
      ).toBe(true);
    } finally {
      context.close();
    }
  });

  it("creates a failed reconciliation run when the provider listing throws before candidate processing", async () => {
    const provider = createMutableSyncProvider([]);
    provider.setListFailure(new Error("provider listing unavailable"));
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });

    try {
      await expect(
        service.reconcileConfirmedOrders({
          provider: "anota_ai",
        }),
      ).rejects.toThrow("provider listing unavailable");

      expect(
        context.database
          .prepare(
            `
              SELECT
                status,
                candidate_count as candidateCount,
                imported_count as importedCount,
                ignored_count as ignoredCount,
                exception_count as exceptionCount,
                error_count as errorCount
              FROM sync_runs
            `,
          )
          .all(),
      ).toEqual([
        {
          status: "failed",
          candidateCount: 0,
          importedCount: 0,
          ignoredCount: 0,
          exceptionCount: 0,
          errorCount: 1,
        },
      ]);
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
