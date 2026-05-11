import { describe, expect, it, vi } from "vitest";

import {
  getDashboardData,
  getOrderDetailData,
} from "@/src/application/production-service";
import type { ProductionRepository } from "@/src/application/ports";
import type { OrderAggregate } from "@/src/domain/production";
import type { SyncExceptionRecord } from "@/src/domain/provider-sync";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createAggregate(orderId = "order_sync"): OrderAggregate {
  return {
    order: {
      id: orderId,
      externalId: orderId.replace("order_", ""),
      reference: "Pedido Sync",
      customerName: "Mesa de teste",
      source: "test",
      createdAt: "2026-05-11T12:00:00.000Z",
      updatedAt: "2026-05-11T12:00:00.000Z",
    },
    items: [
      {
        id: `${orderId}__drink`,
        orderId,
        externalItemId: "drink",
        menuItemId: "iced-coffee",
        name: "Café gelado",
        quantity: 1,
        notes: null,
        kitchenId: "kitchen-1",
        status: "new",
        createdAt: "2026-05-11T12:00:00.000Z",
        updatedAt: "2026-05-11T12:00:00.000Z",
      },
      {
        id: `${orderId}__bakery`,
        orderId,
        externalItemId: "bakery",
        menuItemId: "croissant",
        name: "Croissant",
        quantity: 1,
        notes: null,
        kitchenId: "kitchen-2",
        status: "new",
        createdAt: "2026-05-11T12:00:00.000Z",
        updatedAt: "2026-05-11T12:00:00.000Z",
      },
    ],
    tickets: [
      {
        id: `${orderId}__kitchen-1`,
        orderId,
        kitchenId: "kitchen-1",
        createdAt: "2026-05-11T12:00:00.000Z",
        updatedAt: "2026-05-11T12:00:00.000Z",
      },
      {
        id: `${orderId}__kitchen-2`,
        orderId,
        kitchenId: "kitchen-2",
        createdAt: "2026-05-11T12:00:00.000Z",
        updatedAt: "2026-05-11T12:00:00.000Z",
      },
    ],
  };
}

function createSyncException(
  overrides: Partial<SyncExceptionRecord> = {},
): SyncExceptionRecord {
  return {
    id: "exception-sync",
    provider: "anota_ai",
    externalOrderId: "sync",
    orderId: "order_sync",
    sourceEventId: null,
    kind: "changed_externally",
    status: "open",
    summary: "Pedido Sync divergiu externamente após a importação",
    details: {},
    detectedAt: "2026-05-11T12:00:00.000Z",
    lastSeenAt: "2026-05-11T12:01:00.000Z",
    acknowledgedAt: null,
    acknowledgedVia: null,
    resolvedAt: null,
    resolvedVia: null,
    resolutionNote: null,
    ...overrides,
  };
}

function createReadModelRepository({
  aggregate = createAggregate(),
  unresolvedExceptions = [],
  history = unresolvedExceptions,
}: {
  aggregate?: OrderAggregate;
  unresolvedExceptions?: SyncExceptionRecord[];
  history?: SyncExceptionRecord[];
}) {
  const orderId = aggregate.order.id;

  return {
    listKitchens() {
      return [
        { id: "kitchen-1", name: "Kitchen 1", description: "Cold line" },
        { id: "kitchen-2", name: "Kitchen 2", description: "Hot line" },
      ];
    },
    listKitchenMappings() {
      return [];
    },
    listImportedExternalOrderIds() {
      return [];
    },
    saveImportedOrder() {},
    listOrderAggregates() {
      return [aggregate];
    },
    getOrderAggregate(requestedOrderId: string) {
      return requestedOrderId === orderId ? aggregate : undefined;
    },
    updateItemStatus() {
      throw new Error("not implemented");
    },
    startKitchenTicket() {
      throw new Error("not implemented");
    },
    completeKitchenTicket() {
      throw new Error("not implemented");
    },
    listUnresolvedSyncExceptions() {
      return unresolvedExceptions;
    },
    listUnresolvedSyncExceptionsByOrderIds(orderIds: string[]) {
      return unresolvedExceptions.filter(
        (exception) =>
          exception.orderId !== null && orderIds.includes(exception.orderId),
      );
    },
    getUnresolvedSyncExceptionForOrder(requestedOrderId: string) {
      return unresolvedExceptions.find(
        (exception) => exception.orderId === requestedOrderId,
      );
    },
    listSyncExceptionsForOrder(requestedOrderId: string) {
      return history.filter((exception) => exception.orderId === requestedOrderId);
    },
  };
}

describe("production demo scenarios", () => {
  it("seeds acceptance scenarios for single-kitchen, partially-ready, and ready-to-serve orders", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T10:30:00.000Z"));

    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const dashboard = getDashboardData(context.repository);
      const aggregates = context.repository.listOrderAggregates();

      expect(
        aggregates.find((aggregate) => aggregate.order.id === "order_anota-105")
          ?.tickets.length,
      ).toBe(1);

      expect(
        dashboard.salonSummary.find((order) => order.orderId === "order_anota-102")
          ?.orderStatus,
      ).toBe("Parcialmente pronto");

      expect(
        dashboard.salonSummary.find((order) => order.orderId === "order_anota-103")
          ?.orderStatus,
      ).toBe("Pronto para servir");

      expect(
        dashboard.salonSummary.find((order) => order.orderId === "order_anota-104")
          ?.orderStatus,
      ).toBe("Em andamento");
    } finally {
      context.close();
      vi.useRealTimers();
    }
  });

  it("preserves focus and cross-kitchen visibility in order detail", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const detail = getOrderDetailData(
        context.repository,
        "order_anota-102",
        "kitchen-2",
      );

      expect(detail?.focusKitchenId).toBe("kitchen-2");
      expect(detail?.focusTicketStatus).toBe("in_preparation");
      expect(detail?.otherKitchen?.statusKey).toBe("ready");
      expect(detail?.orderStatusKey).toBe("partially_ready");
    } finally {
      context.close();
    }
  });

  it("includes board-level sync alerts and per-ticket markers without changing kitchen status labels", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "changed_externally",
        orderId: "order_anota-102",
        externalOrderId: "anota-102",
        summary: "Pedido Pedido 102 divergiu externamente após a importação",
        details: {
          diffs: [{ type: "quantity_changed" }],
        },
      });
      context.repository.openOrRefreshException({
        provider: "anota_ai",
        kind: "ingestion_failed",
        externalOrderId: "anota-999",
        summary: "Falha técnica na sincronização do pedido externo",
        details: {
          stage: "fetch",
        },
      });

      const dashboard = getDashboardData(context.repository);
      const kitchen2Preparing = dashboard.kitchens
        .find((kitchen) => kitchen.id === "kitchen-2")
        ?.columns.find((column) => column.status === "in_preparation")
        ?.tickets.find((ticket) => ticket.orderId === "order_anota-102");

      expect(dashboard.openSyncExceptions).toBe(2);
      expect(dashboard.syncAlerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: "order_anota-102",
            label: "Mudança externa",
            statusLabel: "Ação pendente",
          }),
          expect.objectContaining({
            orderId: null,
            externalOrderId: "anota-999",
            label: "Falha de sincronização",
          }),
        ]),
      );
      expect(kitchen2Preparing).toEqual(
        expect.objectContaining({
          ticketStatusLabel: "Em preparo",
          hasOpenSyncException: true,
          syncExceptionLabel: "Mudança externa",
        }),
      );
    } finally {
      context.close();
    }
  });

  it("includes current sync exception and a minimal sync trail in order detail", () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const orderId = "order_anota-101";
    const exception = context.repository.openOrRefreshException({
      provider: "anota_ai",
      kind: "changed_externally",
      orderId,
      externalOrderId: "anota-101",
      summary: "Pedido Pedido 101 divergiu externamente após a importação",
      details: {
        diffs: [
          { type: "quantity_changed" },
          { type: "order_notes_changed" },
        ],
      },
      detectedAt: "2026-05-11T12:00:00.000Z",
      lastSeenAt: "2026-05-11T12:03:00.000Z",
    });

    try {
      context.repository.acknowledgeException({
        acknowledgedAt: "2026-05-11T12:05:00.000Z",
        acknowledgedVia: "salon_ui",
        exceptionId: exception.id,
        orderId,
      });

      const detail = getOrderDetailData(context.repository, orderId, "kitchen-1");

      expect(detail?.syncException).toEqual(
        expect.objectContaining({
          id: exception.id,
          kind: "changed_externally",
          status: "acknowledged",
          label: "Mudança externa",
          statusLabel: "Salão ciente",
          summary: "Pedido 101 divergiu externamente após a importação",
        }),
      );
      expect(detail?.syncTrail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: "acknowledged",
            label: "Salão ciente",
            actor: "Salão",
          }),
          expect.objectContaining({
            event: "detected",
            label: "Mudança externa",
          }),
        ]),
      );
    } finally {
      context.close();
    }
  });

  it("keeps acknowledged exceptions visible in salon summary until reconciliation resolves them", () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const orderId = "order_anota-101";
    const exception = context.repository.openOrRefreshException({
      provider: "anota_ai",
      kind: "changed_externally",
      orderId,
      externalOrderId: "anota-101",
      summary: "Pedido Pedido 101 divergiu externamente após a importação",
      details: {
        diffs: [{ type: "quantity_changed" }],
      },
    });

    try {
      context.repository.acknowledgeException({
        acknowledgedVia: "salon_ui",
        exceptionId: exception.id,
        orderId,
      });

      const dashboard = getDashboardData(context.repository);
      const salonOrder = dashboard.salonSummary.find(
        (order) => order.orderId === orderId,
      );

      expect(salonOrder).toEqual(
        expect.objectContaining({
          hasOpenSyncException: true,
          syncExceptionLabel: "Mudança externa",
          syncException: expect.objectContaining({
            status: "acknowledged",
            statusLabel: "Salão ciente",
          }),
        }),
      );
    } finally {
      context.close();
    }
  });

  it("returns undefined when the requested order does not exist", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      expect(getOrderDetailData(context.repository, "order_missing")).toBeUndefined();
    } finally {
      context.close();
    }
  });

  it("falls back to empty sync metadata when the repository does not expose sync reads", () => {
    const aggregate = createAggregate("order_no_sync");
    const repository: ProductionRepository = {
      listKitchens() {
        return [
          { id: "kitchen-1", name: "Kitchen 1", description: "Cold line" },
          { id: "kitchen-2", name: "Kitchen 2", description: "Hot line" },
        ];
      },
      listKitchenMappings() {
        return [];
      },
      listImportedExternalOrderIds() {
        return [];
      },
      saveImportedOrder() {},
      listOrderAggregates() {
        return [aggregate];
      },
      getOrderAggregate(orderId) {
        return orderId === aggregate.order.id ? aggregate : undefined;
      },
      updateItemStatus() {
        throw new Error("not implemented");
      },
      startKitchenTicket() {
        throw new Error("not implemented");
      },
      completeKitchenTicket() {
        throw new Error("not implemented");
      },
    };

    const dashboard = getDashboardData(repository);
    const detail = getOrderDetailData(repository, aggregate.order.id, "kitchen-1");

    expect(dashboard.openSyncExceptions).toBe(0);
    expect(dashboard.syncAlerts).toEqual([]);
    expect(dashboard.salonSummary[0]).toEqual(
      expect.objectContaining({
        hasOpenSyncException: false,
        syncException: null,
      }),
    );
    expect(detail?.syncException).toBeNull();
    expect(detail?.syncTrail).toEqual([]);
  });

  it("uses fallback copy when a changed_externally exception has no diff details", () => {
    const repository = createReadModelRepository({
      unresolvedExceptions: [
        createSyncException({
          details: {},
        }),
      ],
    });

    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");

    expect(detail?.syncException).toEqual(
      expect.objectContaining({
        detail: "O provedor informou uma mudança operacional após a importação.",
      }),
    );
  });

  it("summarizes long diff sets and renders detailed trail entries for all exception kinds", () => {
    const history = [
      createSyncException({
        id: "exception-changed",
        details: {
          diffs: [
            { type: "quantity_changed" },
            { type: "order_notes_changed" },
            { type: "item_added" },
            { type: "modifiers_changed" },
          ],
        },
      }),
      createSyncException({
        id: "exception-missing",
        kind: "missing_mapping",
        summary: "Pedido Sync bloqueado por item sem mapeamento de cozinha",
        details: {
          menuItemName: "Torta nova",
        },
      }),
      createSyncException({
        id: "exception-canceled",
        kind: "canceled_externally",
        status: "resolved",
        summary: "Pedido Sync saiu de confirmed_ready no provedor",
        details: {
          providerStatus: "CANCELED",
        },
        resolvedAt: "2026-05-11T12:08:00.000Z",
        resolvedVia: "sync_apply_success",
      }),
      createSyncException({
        id: "exception-failed",
        kind: "ingestion_failed",
        status: "acknowledged",
        summary: "Falha técnica na sincronização do pedido externo",
        details: {
          stage: "fetch",
        },
        acknowledgedAt: "2026-05-11T12:06:00.000Z",
      }),
    ];
    const repository = createReadModelRepository({
      unresolvedExceptions: history.filter((exception) => exception.status !== "resolved"),
      history,
    });

    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");

    expect(detail?.syncException).toEqual(
      expect.objectContaining({
        detail:
          "Alterações detectadas: quantidade alterada, observação do pedido alterada, item incluído e mais 1.",
      }),
    );
    expect(detail?.syncTrail).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Item sem mapeamento",
          detail: "Item sem cozinha mapeada: Torta nova.",
        }),
        expect.objectContaining({
          label: "Falha de sincronização",
          detail: "Falha técnica durante a etapa de fetch.",
        }),
        expect.objectContaining({
          event: "resolved",
          actor: "Replay aplicado",
        }),
        expect.objectContaining({
          label: "Cancelado no provedor",
          detail: "Estado atual no provedor: CANCELED.",
        }),
      ]),
    );
  });

  it("returns undefined when an aggregate has no kitchen tickets", () => {
    const repository: ProductionRepository = {
      listKitchens() {
        return [];
      },
      listKitchenMappings() {
        return [];
      },
      listImportedExternalOrderIds() {
        return [];
      },
      saveImportedOrder() {},
      listOrderAggregates() {
        return [];
      },
      getOrderAggregate() {
        return {
          order: {
            id: "order_empty",
            externalId: "external-empty",
            reference: "Pedido vazio",
            customerName: null,
            source: "test",
            createdAt: "2026-05-11T10:00:00.000Z",
            updatedAt: "2026-05-11T10:00:00.000Z",
          },
          items: [],
          tickets: [],
        };
      },
      updateItemStatus() {
        throw new Error("not implemented");
      },
      startKitchenTicket() {
        throw new Error("not implemented");
      },
      completeKitchenTicket() {
        throw new Error("not implemented");
      },
    };

    expect(getOrderDetailData(repository, "order_empty")).toBeUndefined();
  });
});
