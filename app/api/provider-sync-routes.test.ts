import { describe, expect, it } from "vitest";

import { createProviderSyncService } from "@/src/application/provider-sync-service";
import type { OrderSyncProviderPort } from "@/src/application/ports";
import type { ProviderOrderSnapshot } from "@/src/domain/provider-sync";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";
import {
  handlePostAnotaWebhook,
  providerSyncSecretHeaders as webhookSecretHeaders,
} from "@/app/api/integrations/anota-ai/webhook/route";
import {
  handlePostAnotaReconciliation,
  providerSyncSecretHeaders as reconcileSecretHeaders,
} from "@/app/api/internal/sync/anota-ai/route";
import { handlePostAcknowledgeSyncException } from "@/app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route";

function createSnapshot(
  externalOrderId: string,
  overrides: Partial<ProviderOrderSnapshot> = {},
): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId,
    reference: `Pedido ${externalOrderId}`,
    customerName: "Mesa 3",
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
    notes: "Levar ao balcão",
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
            notes: item.notes,
            quantity: item.quantity,
          };
        }),
      };
    },
    clearFetchFailure(externalOrderId) {
      fetchFailures.delete(externalOrderId);
    },
    setFetchFailure(externalOrderId, error) {
      fetchFailures.set(externalOrderId, error);
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

function createJsonRequest(
  body: Record<string, unknown> | undefined,
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
  });
}

describe("provider sync routes", () => {
  it("returns 401 before side effects when webhook auth is missing or invalid", async () => {
    const snapshot = createSnapshot("external-auth-guard");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_ANOTA_WEBHOOK_SECRET: "webhook-secret",
    } as NodeJS.ProcessEnv;

    try {
      const missingSecretResponse = await handlePostAnotaWebhook(
        createJsonRequest({
          deliveryKey: "delivery-auth-missing",
          eventType: "order.confirmed",
          externalOrderId: snapshot.externalOrderId,
        }),
        {
          env,
          service,
        },
      );
      const invalidSecretResponse = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            deliveryKey: "delivery-auth-invalid",
            eventType: "order.confirmed",
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [webhookSecretHeaders.webhook]: "wrong-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(missingSecretResponse.status).toBe(401);
      expect(await missingSecretResponse.json()).toBe("Unauthorized");
      expect(invalidSecretResponse.status).toBe(401);
      expect(await invalidSecretResponse.json()).toBe("Unauthorized");
      expect(countRows(context, "provider_events")).toBe(0);
      expect(countRows(context, "sync_runs")).toBe(0);
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("returns 400 for an invalid webhook envelope without persisting sync state", async () => {
    const snapshot = createSnapshot("external-invalid-envelope");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_ANOTA_WEBHOOK_SECRET: "webhook-secret",
    } as NodeJS.ProcessEnv;

    try {
      const response = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [webhookSecretHeaders.webhook]: "webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toBe("Invalid webhook envelope");
      expect(countRows(context, "provider_events")).toBe(0);
      expect(countRows(context, "sync_runs")).toBe(0);
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
    } finally {
      context.close();
    }
  });

  it("processes webhook imports and duplicate deliveries with terminal 200 outcomes", async () => {
    const snapshot = createSnapshot("external-webhook-success");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_ANOTA_WEBHOOK_SECRET: "webhook-secret",
    } as NodeJS.ProcessEnv;

    try {
      const firstResponse = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            deliveryKey: "delivery-success-1",
            eventType: "order.confirmed",
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [webhookSecretHeaders.webhook]: "webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );
      const duplicateResponse = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            deliveryKey: "delivery-success-1",
            eventType: "order.confirmed",
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [webhookSecretHeaders.webhook]: "webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(firstResponse.status).toBe(200);
      expect(await firstResponse.json()).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "imported",
          orderId: expect.any(String),
          externalOrderId: snapshot.externalOrderId,
        }),
      );
      expect(duplicateResponse.status).toBe(200);
      expect(await duplicateResponse.json()).toEqual(
        expect.objectContaining({
          runId: null,
          eventId: null,
          status: "completed",
          outcome: "duplicate_ignored",
          externalOrderId: snapshot.externalOrderId,
        }),
      );
      expect(countRows(context, "provider_events")).toBe(1);
      expect(countRows(context, "sync_runs")).toBe(1);
      expect(countRows(context, "provider_orders")).toBe(1);
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
    } finally {
      context.close();
    }
  });

  it("returns 401 for reconciliation auth failures before any run is created", async () => {
    const snapshot = createSnapshot("external-reconcile-auth");
    const provider = createMutableSyncProvider([snapshot]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_INTERNAL_SYNC_SECRET: "sync-secret",
    } as NodeJS.ProcessEnv;

    try {
      const response = await handlePostAnotaReconciliation(
        createJsonRequest(
          {
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [reconcileSecretHeaders.reconcile]: "wrong-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(response.status).toBe(401);
      expect(await response.json()).toBe("Unauthorized");
      expect(countRows(context, "sync_runs")).toBe(0);
      expect(countRows(context, "provider_events")).toBe(0);
    } finally {
      context.close();
    }
  });

  it("returns 500 for canonical fetch failure and allows targeted reconciliation replay", async () => {
    const snapshot = createSnapshot("external-replayable");
    const provider = createMutableSyncProvider([snapshot]);
    provider.setFetchFailure(snapshot.externalOrderId, new Error("upstream down"));
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_ANOTA_WEBHOOK_SECRET: "webhook-secret",
      BISTRO_INTERNAL_SYNC_SECRET: "sync-secret",
    } as NodeJS.ProcessEnv;

    try {
      const failedWebhookResponse = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            deliveryKey: "delivery-replayable-1",
            eventType: "order.confirmed",
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [webhookSecretHeaders.webhook]: "webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(failedWebhookResponse.status).toBe(500);
      expect(await failedWebhookResponse.json()).toEqual(
        expect.objectContaining({
          status: "failed",
          outcome: "exception_opened",
          exceptionKind: "ingestion_failed",
          externalOrderId: snapshot.externalOrderId,
        }),
      );
      expect(
        context.database
          .prepare(
            `
              SELECT process_status as processStatus
              FROM provider_events
              WHERE delivery_key = ?
            `,
          )
          .get("delivery-replayable-1"),
      ).toEqual({
        processStatus: "failed",
      });
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([
        expect.objectContaining({
          kind: "ingestion_failed",
          externalOrderId: snapshot.externalOrderId,
        }),
      ]);

      provider.clearFetchFailure(snapshot.externalOrderId);

      const replayResponse = await handlePostAnotaReconciliation(
        createJsonRequest(
          {
            externalOrderId: snapshot.externalOrderId,
          },
          {
            [reconcileSecretHeaders.reconcile]: "sync-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(replayResponse.status).toBe(200);
      expect(await replayResponse.json()).toEqual(
        expect.objectContaining({
          status: "completed",
          processed: 1,
          imported: 1,
          resolvedExceptions: 1,
          errorCount: 0,
          runId: expect.any(String),
        }),
      );
      expect(context.repository.listUnresolvedSyncExceptions()).toEqual([]);
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
    } finally {
      context.close();
    }
  });

  it("returns 200 when acknowledging an open exception", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const orderId = "order_anota-101";
    const exception = context.repository.openOrRefreshException({
      provider: "anota_ai",
      kind: "changed_externally",
      orderId,
      externalOrderId: "anota-101",
      summary: "Mudança externa detectada",
      details: {
        diffs: [{ type: "quantity_changed" }],
      },
    });
    const service = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });

    try {
      const response = await handlePostAcknowledgeSyncException(
        createJsonRequest({
          resolutionNote: "Atendimento ciente",
        }),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          service,
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        exceptionId: exception.id,
        orderId,
        status: "acknowledged",
      });
      expect(
        context.repository
          .listSyncExceptionsForOrder(orderId)
          .find((entry) => entry.id === exception.id),
      ).toEqual(
        expect.objectContaining({
          status: "acknowledged",
          acknowledgedVia: "salon_ui",
          resolutionNote: "Atendimento ciente",
        }),
      );
    } finally {
      context.close();
    }
  });

  it("returns 200 when the same exception is already acknowledged", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const orderId = "order_anota-101";
    const exception = context.repository.openOrRefreshException({
      provider: "anota_ai",
      kind: "changed_externally",
      orderId,
      externalOrderId: "anota-101",
      summary: "Mudança externa detectada",
      details: {
        diffs: [{ type: "quantity_changed" }],
      },
    });
    const service = createProviderSyncService({
      provider: createMutableSyncProvider([]),
      repository: context.repository,
    });

    try {
      const firstResponse = await handlePostAcknowledgeSyncException(
        createJsonRequest(undefined),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          service,
        },
      );
      const secondResponse = await handlePostAcknowledgeSyncException(
        createJsonRequest(undefined),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          service,
        },
      );

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(200);
      expect(await secondResponse.json()).toEqual({
        exceptionId: exception.id,
        orderId,
        status: "acknowledged",
      });
      expect(
        context.repository
          .listSyncExceptionsForOrder(orderId)
          .find((entry) => entry.id === exception.id)?.status,
      ).toBe("acknowledged");
    } finally {
      context.close();
    }
  });
});
