import { describe, expect, it, vi } from "vitest";

import { createProviderSyncService } from "@/src/application/provider-sync-service";
import type {
  OrderSyncProviderPort,
  ProviderSyncService,
} from "@/src/application/ports";
import type { ProviderOrderSnapshot } from "@/src/domain/provider-sync";
import type { AreaAccessRuntimeConfig } from "@/src/infrastructure/area-session";
import { signAreaSession } from "@/src/infrastructure/area-session";
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

function createRuntimeConfig(): AreaAccessRuntimeConfig {
  return {
    cookieName: "bistro_area_session",
    pins: {
      "kitchen-1": "1111",
      "kitchen-2": "2222",
      salon: "3333",
    },
    renewalWindowMs: 4 * 60 * 60 * 1000,
    renewalWindowRatio: 0.25,
    secureCookies: false,
    sessionSecret: "route-secret",
    sessionTtlHours: 16,
    sessionTtlMs: 16 * 60 * 60 * 1000,
    sessionTtlSeconds: 16 * 60 * 60,
  };
}

function createCookieHeader(
  config: AreaAccessRuntimeConfig,
  areaId: "kitchen-1" | "kitchen-2" | "salon",
) {
  return `${config.cookieName}=${signAreaSession(
    {
      areaId,
      expiresAt: "2026-05-13T16:00:00.000Z",
      issuedAt: "2026-05-13T00:00:00.000Z",
      version: 1,
    },
    config,
  )}`;
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

  it("accepts Authorization auth and a canonical Anota order payload without an explicit webhook envelope", async () => {
    const snapshot = createSnapshot("6a037bb9079be15595881d88");
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
            menu_version: 2,
            _id: snapshot.externalOrderId,
            id: snapshot.externalOrderId,
            check: 1,
            createdAt: "2026-05-12T19:12:57.327Z",
            salesChannel: "anotaai",
            items: [
              {
                id: 0,
                name: "Cappuccino italiano 190ml",
                quantity: 1,
                externalId: "cappuccino",
                subItems: [],
              },
            ],
          },
          {
            Authorization: "Bearer webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "imported",
          externalOrderId: snapshot.externalOrderId,
        }),
      );
      expect(countRows(context, "provider_events")).toBe(1);
      expect(countRows(context, "sync_runs")).toBe(1);
    } finally {
      context.close();
    }
  });

  it("accepts the minimal canceled-order webhook payload emitted by Anota AI", async () => {
    const baseline = createSnapshot("6a03ad49fdcc75bcd0bff4ed");
    const provider = createMutableSyncProvider([baseline]);
    const context = createProductionTestContext();
    const service = createProviderSyncService({
      provider,
      repository: context.repository,
    });
    const env = {
      BISTRO_ANOTA_WEBHOOK_SECRET: "webhook-secret",
    } as NodeJS.ProcessEnv;

    try {
      await service.handleWebhook({
        provider: "anota_ai",
        deliveryKey: "delivery-canceled-import-1",
        eventType: "order.confirmed",
        externalOrderId: baseline.externalOrderId,
        payload: { id: baseline.externalOrderId },
      });

      provider.setSnapshot(
        createSnapshot("6a03ad49fdcc75bcd0bff4ed", {
          lifecycle: "canceled",
          providerStatus: "CANCELED",
          providerUpdatedAt: "2026-05-12T23:15:00.000Z",
          items: [],
        }),
      );

      const response = await handlePostAnotaWebhook(
        createJsonRequest(
          {
            id: baseline.externalOrderId,
            justification: "teste",
            canceled: true,
            merchant: {
              id: "69f1f2401749a4e61094297c",
            },
          },
          {
            Authorization: "Bearer webhook-secret",
          },
        ),
        {
          env,
          service,
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(
        expect.objectContaining({
          status: "completed",
          outcome: "exception_opened",
          externalOrderId: baseline.externalOrderId,
          exceptionKind: "canceled_externally",
        }),
      );
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
    const config = createRuntimeConfig();
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
        createJsonRequest(
          {
            resolutionNote: "Atendimento ciente",
          },
          {
            cookie: createCookieHeader(config, "salon"),
          },
        ),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
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
    const config = createRuntimeConfig();
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
      const requestHeaders = {
        cookie: createCookieHeader(config, "salon"),
      };
      const firstResponse = await handlePostAcknowledgeSyncException(
        createJsonRequest(undefined, requestHeaders),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          service,
        },
      );
      const secondResponse = await handlePostAcknowledgeSyncException(
        createJsonRequest(undefined, requestHeaders),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
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

  it("returns 403 for acknowledge attempts from a kitchen session before the sync service runs", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
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
    const acknowledgeException = vi.fn(async () => {});
    const service = {
      acknowledgeException,
    } as unknown as ProviderSyncService;

    try {
      const response = await handlePostAcknowledgeSyncException(
        createJsonRequest(
          {
            resolutionNote: "Não deveria passar",
          },
          {
            cookie: createCookieHeader(config, "kitchen-1"),
          },
        ),
        {
          exceptionId: exception.id,
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          service,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(acknowledgeException).not.toHaveBeenCalled();
      expect(
        context.repository
          .listSyncExceptionsForOrder(orderId)
          .find((entry) => entry.id === exception.id)?.status,
      ).toBe("open");
    } finally {
      context.close();
    }
  });

  it.each([
    {
      cookieHeader: undefined,
      label: "missing session",
    },
    {
      cookieHeader: "bistro_area_session=invalid",
      label: "invalid session",
    },
  ])(
    "returns 401 for acknowledge attempts with a $label",
    async ({ cookieHeader }) => {
      const context = createProductionTestContext({
        importProviderOrders: true,
      });
      const config = createRuntimeConfig();
      const acknowledgeException = vi.fn(async () => {});
      const service = {
        acknowledgeException,
      } as unknown as ProviderSyncService;

      try {
        const response = await handlePostAcknowledgeSyncException(
          createJsonRequest(
            {
              resolutionNote: "Atendimento ciente",
            },
            cookieHeader ? { cookie: cookieHeader } : {},
          ),
          {
            exceptionId: "exception-123",
            orderId: "order_anota-101",
          },
          {
            config,
            now: new Date("2026-05-13T12:00:00.000Z"),
            service,
          },
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toBe("Unauthorized");
        expect(acknowledgeException).not.toHaveBeenCalled();
      } finally {
        context.close();
      }
    },
  );
});
