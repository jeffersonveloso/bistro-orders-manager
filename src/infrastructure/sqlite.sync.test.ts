import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createProviderOrderReference,
  type ProviderOrderSnapshot,
  type ProviderOrderState,
} from "@/src/domain/provider-sync";
import { splitProviderOrder } from "@/src/domain/split-order-service";
import {
  createProductionTestContext,
  getProductionRepository,
  mapSyncExceptionRow,
  mapSyncRunRow,
  resetProductionRepositoryForTests,
  type SqliteProductionRepository,
  type SyncExceptionRow,
  type SyncRunRow,
} from "@/src/infrastructure/sqlite";

function createSnapshot(
  externalOrderId: string,
  overrides: Partial<ProviderOrderSnapshot> = {},
): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId,
    reference: `Pedido ${externalOrderId}`,
    customerName: "Mesa 7",
    channel: "mock-anota-ai",
    providerStatus: "CONFIRMED",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: "2026-05-11T12:00:00.000Z",
    items: [
      {
        externalItemId: `${externalOrderId}-item-1`,
        catalogExternalId: "iced-coffee",
        name: "Café gelado",
        quantity: 1,
        modifiers: [],
      },
    ],
    notes: "Sem açúcar",
    rawPayload: { id: externalOrderId },
    ...overrides,
  };
}

function createProviderOrderState(
  externalOrderId: string,
  overrides: Partial<ProviderOrderState> = {},
): ProviderOrderState {
  const snapshot = createSnapshot(externalOrderId, overrides.snapshot ?? {});

  return {
    ...createProviderOrderReference({
      provider: "anota_ai",
      externalOrderId,
    }),
    providerStatus: snapshot.providerStatus,
    lifecycle: snapshot.lifecycle,
    snapshotHash: `hash-${externalOrderId}`,
    snapshot,
    lastSeenAt: snapshot.providerUpdatedAt,
    lastAppliedAt: null,
    importedOrderId: null,
    ...overrides,
  };
}

function importOrder(
  repository: SqliteProductionRepository,
  externalId: string,
  createdAt = "2026-05-11T11:00:00.000Z",
) {
  const payload = splitProviderOrder(
    {
      externalId,
      reference: `Pedido ${externalId}`,
      customerName: "Mesa 3",
      channel: "test",
      createdAt,
      items: [
        {
          externalItemId: `${externalId}-drink`,
          menuItemId: "iced-coffee",
          name: "Café gelado",
          quantity: 1,
        },
        {
          externalItemId: `${externalId}-bakery`,
          menuItemId: "croissant",
          name: "Croissant",
          quantity: 1,
        },
      ],
    },
    repository.listKitchenMappings(),
  );

  repository.saveImportedOrder(payload);

  return payload.order.id;
}

function countRows(context: ReturnType<typeof createProductionTestContext>, table: string) {
  return (
    context.database
      .prepare(`SELECT COUNT(*) as count FROM ${table}`)
      .get() as { count: number }
  ).count;
}

describe("sqlite sync repository", () => {
  it("enforces unique provider item ids and unique item names in kitchen mappings", () => {
    const context = createProductionTestContext({
      initialKitchenMappings: [],
    });

    try {
      context.repository.upsertKitchenMapping({
        kitchenId: "kitchen-2",
        menuItemId: "uuid-club-sandwich",
        menuItemName: "Club Sandwich",
        providerItemId: "provider-item-club-sandwich",
        providerExternalId: "club-sandwich",
      });

      expect(() =>
        context.repository.upsertKitchenMapping({
          kitchenId: "kitchen-2",
          menuItemId: "uuid-club-sandwich-2",
          menuItemName: "Club Sandwich",
          providerItemId: "provider-item-other",
          providerExternalId: "club-sandwich-2",
        }),
      ).toThrow(/unique/i);

      expect(() =>
        context.repository.upsertKitchenMapping({
          kitchenId: "kitchen-2",
          menuItemId: "uuid-club-sandwich-3",
          menuItemName: "Outro Nome",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich-3",
        }),
      ).toThrow(/unique/i);
    } finally {
      context.close();
    }
  });

  it("persists provider catalog item name and description updates locally", () => {
    const context = createProductionTestContext();

    try {
      context.repository.upsertProviderCatalogItems([
        {
          provider: "anota_ai",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich",
          name: "Club Sandwich",
          description: "Versão inicial.",
          updatedAt: "2026-05-11T12:00:00.000Z",
          rawPayload: { id: "provider-item-club-sandwich" },
        },
      ]);
      context.repository.upsertProviderCatalogItems([
        {
          provider: "anota_ai",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich",
          name: "Club Sandwich defumado",
          description: "Pão brioche, frango defumado e molho da casa.",
          updatedAt: "2026-05-11T13:00:00.000Z",
          rawPayload: { id: "provider-item-club-sandwich", version: 2 },
        },
      ]);

      expect(context.repository.listProviderCatalogItems()).toEqual([
        {
          provider: "anota_ai",
          providerItemId: "provider-item-club-sandwich",
          providerExternalId: "club-sandwich",
          name: "Club Sandwich defumado",
          description: "Pão brioche, frango defumado e molho da casa.",
          updatedAt: "2026-05-11T13:00:00.000Z",
          rawPayload: { id: "provider-item-club-sandwich", version: 2 },
        },
      ]);
    } finally {
      context.close();
    }
  });

  it("maps sync run and exception rows into typed records", () => {
    const run = mapSyncRunRow({
      id: "run-1",
      provider: "anota_ai",
      trigger: "webhook",
      status: "completed",
      startedAt: "2026-05-11T12:00:00.000Z",
      finishedAt: "2026-05-11T12:01:00.000Z",
      candidateCount: 3,
      importedCount: 2,
      ignoredCount: 1,
      exceptionCount: 1,
      errorCount: 0,
    } satisfies SyncRunRow);

    const exception = mapSyncExceptionRow({
      id: "exception-1",
      provider: "anota_ai",
      externalOrderId: "external-1",
      orderId: "order_external-1",
      sourceEventId: "event-1",
      kind: "changed_externally",
      status: "acknowledged",
      summary: "Pedido alterado fora do sistema",
      detailsJson: JSON.stringify({ changedFields: ["items"] }),
      detectedAt: "2026-05-11T12:00:00.000Z",
      lastSeenAt: "2026-05-11T12:03:00.000Z",
      acknowledgedAt: "2026-05-11T12:02:00.000Z",
      acknowledgedVia: "salon",
      resolvedAt: null,
      resolvedVia: null,
      resolutionNote: "Equipe avisada",
    } satisfies SyncExceptionRow);

    expect(run).toEqual({
      id: "run-1",
      provider: "anota_ai",
      trigger: "webhook",
      status: "completed",
      startedAt: "2026-05-11T12:00:00.000Z",
      finishedAt: "2026-05-11T12:01:00.000Z",
      candidateCount: 3,
      importedCount: 2,
      ignoredCount: 1,
      exceptionCount: 1,
      errorCount: 0,
    });
    expect(exception.status).toBe("acknowledged");
    expect(exception.details).toEqual({ changedFields: ["items"] });
    expect(exception.acknowledgedVia).toBe("salon");
  });

  it("persists exception lifecycle transitions and preserves acknowledged refresh state", () => {
    const context = createProductionTestContext();

    try {
      const orderId = importOrder(context.repository, "external-lifecycle");
      const opened = context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-lifecycle",
        orderId,
        summary: "Quantidade alterada externamente",
        details: { diff: "quantity" },
        detectedAt: "2026-05-11T12:00:00.000Z",
        lastSeenAt: "2026-05-11T12:00:00.000Z",
      });

      context.repository.acknowledgeException({
        orderId,
        exceptionId: opened.id,
        acknowledgedVia: "salon-panel",
        acknowledgedAt: "2026-05-11T12:01:00.000Z",
      });

      const refreshed = context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-lifecycle",
        orderId,
        summary: "Quantidade alterada externamente novamente",
        details: { diff: "quantity", seenAgain: true },
        lastSeenAt: "2026-05-11T12:05:00.000Z",
      });

      expect(refreshed.id).toBe(opened.id);
      expect(refreshed.status).toBe("acknowledged");
      expect(refreshed.acknowledgedVia).toBe("salon-panel");
      expect(refreshed.details).toEqual({
        diff: "quantity",
        seenAgain: true,
      });

      context.repository.resolveException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-lifecycle",
        orderId,
        resolvedVia: "reconciliation",
        resolvedAt: "2026-05-11T12:10:00.000Z",
        resolutionNote: "Snapshot voltou ao estado esperado",
      });

      expect(
        context.repository.getUnresolvedSyncExceptionForOrder(orderId),
      ).toBeUndefined();

      expect(context.repository.listSyncExceptionsForOrder(orderId)).toEqual([
        expect.objectContaining({
          id: opened.id,
          status: "resolved",
          resolvedVia: "reconciliation",
          resolutionNote: "Snapshot voltou ao estado esperado",
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("enforces provider-scoped uniqueness for inbound events and provider orders", () => {
    const context = createProductionTestContext();

    try {
      context.repository.recordInboundEvent({
        provider: "anota_ai",
        deliveryKey: "delivery-dup",
        eventType: "order.confirmed",
        externalOrderId: "external-dup",
        payload: { id: "external-dup" },
        receivedAt: "2026-05-11T12:00:00.000Z",
      });

      expect(() =>
        context.repository.recordInboundEvent({
          provider: "anota_ai",
          deliveryKey: "delivery-dup",
          eventType: "order.confirmed",
          externalOrderId: "external-dup",
          payload: { id: "external-dup" },
          receivedAt: "2026-05-11T12:00:01.000Z",
        }),
      ).toThrow(/UNIQUE|constraint/i);

      const snapshot = createSnapshot("external-provider-order");
      context.database
        .prepare(
          `
            INSERT INTO provider_orders (
              provider,
              external_order_id,
              provider_status,
              lifecycle,
              snapshot_hash,
              normalized_json,
              last_seen_at,
              last_applied_at,
              imported_order_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          snapshot.provider,
          snapshot.externalOrderId,
          snapshot.providerStatus,
          snapshot.lifecycle,
          "hash-1",
          JSON.stringify(snapshot),
          snapshot.providerUpdatedAt,
          null,
          null,
        );

      expect(() =>
        context.database
          .prepare(
            `
              INSERT INTO provider_orders (
                provider,
                external_order_id,
                provider_status,
                lifecycle,
                snapshot_hash,
                normalized_json,
                last_seen_at,
                last_applied_at,
                imported_order_id
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
          )
          .run(
            snapshot.provider,
            snapshot.externalOrderId,
            "UPDATED",
            snapshot.lifecycle,
            "hash-2",
            JSON.stringify(snapshot),
            "2026-05-11T12:05:00.000Z",
            null,
            null,
          ),
      ).toThrow(/UNIQUE|constraint/i);
    } finally {
      context.close();
    }
  });

  it("writes sync artifacts atomically across rollback and commit paths", () => {
    const context = createProductionTestContext();

    try {
      const orderId = importOrder(context.repository, "external-atomic");

      expect(() =>
        context.repository.runInTransaction(() => {
          const event = context.repository.recordInboundEvent({
            provider: "anota_ai",
            deliveryKey: "delivery-atomic-rollback",
            eventType: "order.confirmed",
            externalOrderId: "external-atomic",
            payload: { id: "external-atomic" },
            receivedAt: "2026-05-11T12:00:00.000Z",
          });
          const run = context.repository.startSyncRun({
            provider: "anota_ai",
            trigger: "webhook",
            candidateCount: 1,
            sourceEventId: event.id,
            startedAt: "2026-05-11T12:00:01.000Z",
          });

          context.repository.upsertProviderOrder({
            ...createProviderOrderState("external-atomic", {
              importedOrderId: orderId,
              lastAppliedAt: "2026-05-11T12:00:02.000Z",
            }),
          });

          context.repository.openOrRefreshException({
            provider: "anota_ai",
            kind: "changed_externally",
            externalOrderId: "external-atomic",
            orderId,
            sourceEventId: event.id,
            summary: "Rollback de teste",
            details: { runId: run.id },
          });

          throw new Error("force rollback");
        }),
      ).toThrow("force rollback");

      expect(countRows(context, "provider_events")).toBe(0);
      expect(countRows(context, "sync_runs")).toBe(0);
      expect(countRows(context, "provider_orders")).toBe(0);
      expect(countRows(context, "order_sync_exceptions")).toBe(0);

      context.repository.runInTransaction(() => {
        const event = context.repository.recordInboundEvent({
          provider: "anota_ai",
          deliveryKey: "delivery-atomic-commit",
          eventType: "order.confirmed",
          externalOrderId: "external-atomic",
          payload: { id: "external-atomic" },
          receivedAt: "2026-05-11T12:10:00.000Z",
        });
        const run = context.repository.startSyncRun({
          provider: "anota_ai",
          trigger: "webhook",
          candidateCount: 1,
          sourceEventId: event.id,
          startedAt: "2026-05-11T12:10:01.000Z",
        });

        context.repository.upsertProviderOrder({
          ...createProviderOrderState("external-atomic", {
            importedOrderId: orderId,
            lastAppliedAt: "2026-05-11T12:10:02.000Z",
          }),
        });

        context.repository.openOrRefreshException({
          provider: "anota_ai",
          kind: "changed_externally",
          externalOrderId: "external-atomic",
          orderId,
          sourceEventId: event.id,
          summary: "Pedido alterado depois do import",
          details: { reason: "quantity_change" },
          detectedAt: "2026-05-11T12:10:03.000Z",
          lastSeenAt: "2026-05-11T12:10:03.000Z",
        });

        context.repository.finishSyncRun({
          syncRunId: run.id,
          status: "completed",
          finishedAt: "2026-05-11T12:10:04.000Z",
          candidateCount: 1,
          importedCount: 0,
          ignoredCount: 0,
          exceptionCount: 1,
          errorCount: 0,
          event: {
            eventId: event.id,
            processStatus: "processed",
            processedAt: "2026-05-11T12:10:04.000Z",
          },
        });
      });

      expect(countRows(context, "provider_events")).toBe(1);
      expect(countRows(context, "sync_runs")).toBe(1);
      expect(countRows(context, "provider_orders")).toBe(1);
      expect(countRows(context, "order_sync_exceptions")).toBe(1);

      expect(
        context.repository.getProviderOrder(
          createProviderOrderReference({
            provider: "anota_ai",
            externalOrderId: "external-atomic",
          }),
        ),
      ).toEqual(
        expect.objectContaining({
          importedOrderId: orderId,
          snapshotHash: "hash-external-atomic",
        }),
      );
      expect(
        context.repository.getUnresolvedSyncExceptionForOrder(orderId),
      ).toEqual(
        expect.objectContaining({
          status: "open",
          kind: "changed_externally",
        }),
      );
      expect(
        context.database
          .prepare(
            `
              SELECT process_status as processStatus, sync_run_id as syncRunId
              FROM provider_events
              WHERE delivery_key = ?
            `,
          )
          .get("delivery-atomic-commit"),
      ).toEqual(
        expect.objectContaining({
          processStatus: "processed",
          syncRunId: expect.any(String),
        }),
      );
    } finally {
      context.close();
    }
  });

  it("covers initialization branches, empty unresolved queries, and acknowledge guards", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
      provider: {
        listOrders() {
          return [
            {
              externalId: "provider-valid",
              reference: "Pedido válido",
              customerName: "Mesa 8",
              channel: "test-provider",
              createdAt: "2026-05-11T13:00:00.000Z",
              items: [
                {
                  externalItemId: "provider-valid-item",
                  menuItemId: "iced-coffee",
                  name: "Café gelado",
                  quantity: 1,
                },
              ],
            },
            {
              externalId: "provider-invalid",
              reference: "Pedido sem mapeamento",
              customerName: "Mesa 9",
              channel: "test-provider",
              createdAt: "2026-05-11T13:05:00.000Z",
              items: [
                {
                  externalItemId: "provider-invalid-item",
                  menuItemId: "not-mapped",
                  name: "Sem mapeamento",
                  quantity: 1,
                },
              ],
            },
          ];
        },
      },
    });

    try {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[order-sync] skipped provider-invalid"),
      );
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
      expect(
        context.repository.listUnresolvedSyncExceptionsByOrderIds([]),
      ).toEqual([]);

      const orderId = importOrder(context.repository, "external-guards");
      const exception = context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-guards",
        orderId,
        summary: "Guard branches",
      });

      context.repository.acknowledgeException({
        orderId,
        exceptionId: exception.id,
        acknowledgedVia: "salon",
      });
      context.repository.acknowledgeException({
        orderId,
        exceptionId: exception.id,
        acknowledgedVia: "salon",
      });

      context.repository.resolveException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-guards",
        orderId,
        resolvedVia: "reconciliation",
      });

      expect(() =>
        context.repository.acknowledgeException({
          orderId,
          exceptionId: exception.id,
          acknowledgedVia: "salon",
        }),
      ).toThrow(/already resolved/i);
    } finally {
      warnSpy.mockRestore();
      context.close();
    }
  });

  it("returns unresolved order-linked exceptions for board and detail decoration", () => {
    const context = createProductionTestContext();

    try {
      const firstOrderId = importOrder(
        context.repository,
        "external-board-1",
        "2026-05-11T10:00:00.000Z",
      );
      const secondOrderId = importOrder(
        context.repository,
        "external-board-2",
        "2026-05-11T10:05:00.000Z",
      );

      context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "missing_mapping",
        externalOrderId: "external-board-1",
        orderId: firstOrderId,
        summary: "Exceção resolvida depois",
        details: { reason: "mapping" },
        detectedAt: "2026-05-11T12:00:00.000Z",
        lastSeenAt: "2026-05-11T12:00:00.000Z",
      });
      const acknowledged = context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "changed_externally",
        externalOrderId: "external-board-2",
        orderId: secondOrderId,
        summary: "Pedido 2 alterado",
        details: { reason: "note_change" },
        detectedAt: "2026-05-11T12:02:00.000Z",
        lastSeenAt: "2026-05-11T12:02:00.000Z",
      });
      context.repository.acknowledgeException({
        orderId: secondOrderId,
        exceptionId: acknowledged.id,
        acknowledgedVia: "salon-panel",
        acknowledgedAt: "2026-05-11T12:03:00.000Z",
      });
      context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "ingestion_failed",
        externalOrderId: "external-only",
        summary: "Falha sem pedido importado",
        details: { reason: "canonical_fetch_failed" },
        detectedAt: "2026-05-11T12:04:00.000Z",
        lastSeenAt: "2026-05-11T12:04:00.000Z",
      });

      context.repository.resolveException({
        provider: "anota_ai",
        kind: "missing_mapping",
        externalOrderId: "external-board-1",
        orderId: firstOrderId,
        resolvedVia: "replay",
        resolvedAt: "2026-05-11T12:06:00.000Z",
      });

      expect(
        context.repository.listUnresolvedSyncExceptionsByOrderIds([
          firstOrderId,
          secondOrderId,
        ]),
      ).toEqual([
        expect.objectContaining({
          orderId: secondOrderId,
          status: "acknowledged",
          kind: "changed_externally",
        }),
      ]);

      expect(
        context.repository.getUnresolvedSyncExceptionForOrder(secondOrderId),
      ).toEqual(
        expect.objectContaining({
          id: acknowledged.id,
          status: "acknowledged",
        }),
      );

      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          externalOrderId: "external-only",
          orderId: null,
          kind: "ingestion_failed",
        }),
        expect.objectContaining({
          orderId: secondOrderId,
          kind: "changed_externally",
        }),
      ]);

      expect(context.repository.listSyncExceptionsForOrder(firstOrderId)).toEqual([
        expect.objectContaining({
          orderId: firstOrderId,
          status: "resolved",
          kind: "missing_mapping",
        }),
      ]);
    } finally {
      context.close();
    }
  });

  it("fails fast on invalid sync row literals", () => {
    expect(() =>
      mapSyncRunRow({
        id: "run-invalid",
        provider: "anota_ai",
        trigger: "unsupported",
        status: "completed",
        startedAt: "2026-05-11T12:00:00.000Z",
        finishedAt: null,
        candidateCount: 0,
        importedCount: 0,
        ignoredCount: 0,
        exceptionCount: 0,
        errorCount: 0,
      }),
    ).toThrow(/sync trigger/i);

    expect(() =>
      mapSyncExceptionRow({
        id: "exception-invalid",
        provider: "unknown_provider",
        externalOrderId: null,
        orderId: null,
        sourceEventId: null,
        kind: "ingestion_failed",
        status: "open",
        summary: "invalid",
        detailsJson: JSON.stringify(null),
        detectedAt: "2026-05-11T12:00:00.000Z",
        lastSeenAt: "2026-05-11T12:00:00.000Z",
        acknowledgedAt: null,
        acknowledgedVia: null,
        resolvedAt: null,
        resolvedVia: null,
        resolutionNote: null,
      }),
    ).toThrow(/Unsupported provider value/i);
  });

  it("uses the configured SQLite path and reuses the singleton repository", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "bistro-sync-"),
    );
    const databasePath = path.join(temporaryDirectory, "runtime.sqlite");
    const previousPath = process.env.BISTRO_DATABASE_PATH;
    const previousMode = process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE;

    try {
      process.env.BISTRO_DATABASE_PATH = databasePath;
      delete process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE;
      resetProductionRepositoryForTests();

      const firstRepository = getProductionRepository();
      const secondRepository = getProductionRepository();

      expect(firstRepository).toBe(secondRepository);
      expect(fs.existsSync(databasePath)).toBe(true);
    } finally {
      resetProductionRepositoryForTests();

      if (previousPath) {
        process.env.BISTRO_DATABASE_PATH = previousPath;
      } else {
        delete process.env.BISTRO_DATABASE_PATH;
      }

      if (previousMode) {
        process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = previousMode;
      } else {
        delete process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE;
      }

      fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });

  it("starts with a clean production board when runtime mode is anota_ai", () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "bistro-sync-live-"),
    );
    const databasePath = path.join(temporaryDirectory, "runtime-live.sqlite");
    const previousPath = process.env.BISTRO_DATABASE_PATH;
    const previousMode = process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE;

    try {
      process.env.BISTRO_DATABASE_PATH = databasePath;
      process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = "anota_ai";
      resetProductionRepositoryForTests();

      const runtimeRepository = getProductionRepository();

      expect(runtimeRepository.listKitchens()).toHaveLength(2);
      expect(runtimeRepository.listKitchenMappings()).toHaveLength(0);
      expect(runtimeRepository.listOrderAggregates()).toHaveLength(0);
      expect(runtimeRepository.listUnresolvedSyncExceptions()).toHaveLength(0);
    } finally {
      resetProductionRepositoryForTests();

      if (previousPath) {
        process.env.BISTRO_DATABASE_PATH = previousPath;
      } else {
        delete process.env.BISTRO_DATABASE_PATH;
      }

      if (previousMode) {
        process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = previousMode;
      } else {
        delete process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE;
      }

      fs.rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
