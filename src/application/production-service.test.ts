import { describe, expect, it, vi } from "vitest";

import {
  getDashboardData,
  getOrderDetailData,
  getSalonData,
} from "@/src/application/production-service";
import type { ProductionRepository } from "@/src/application/ports";
import type { OrderAggregate } from "@/src/domain/production";
import type {
  ProviderOrderState,
  SyncExceptionRecord,
} from "@/src/domain/provider-sync";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createAggregate(orderId = "order_sync"): OrderAggregate {
  return {
    order: {
      id: orderId,
      externalId: orderId.replace("order_", ""),
      reference: "Pedido Sync",
      customerName: "Mesa de teste",
      localCanceledAt: null,
      localCanceledByAreaId: null,
      localCanceledByRole: null,
      localCancellationReason: null,
      waiterName: "Camila",
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
        providerAddedAt: null,
        providerRemovedAt: null,
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
        providerAddedAt: null,
        providerRemovedAt: null,
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
  providerStates = [],
}: {
  aggregate?: OrderAggregate;
  unresolvedExceptions?: SyncExceptionRecord[];
  history?: SyncExceptionRecord[];
  providerStates?: ProviderOrderState[];
}) {
  const orderId = aggregate.order.id;
  const providerStateByExternalOrderId = new Map(
    providerStates.map((state) => [state.externalOrderId, state] as const),
  );

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
    replaceImportedOrder() {},
    listOrderAggregates() {
      return [aggregate];
    },
    getOrderAggregate(requestedOrderId: string) {
      return requestedOrderId === orderId ? aggregate : undefined;
    },
    updateItemStatus() {
      throw new Error("not implemented");
    },
    cancelOrderLocally() {
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
    getProviderOrder({ externalOrderId }: { externalOrderId: string }) {
      return providerStateByExternalOrderId.get(externalOrderId);
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
  it("builds a dedicated salon contract without kitchen board columns", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:00:00.000Z"));

    const repository = createReadModelRepository({
      unresolvedExceptions: [createSyncException()],
    });

    try {
      const salonData = getSalonData(repository);

      expect(salonData).toEqual(
        expect.objectContaining({
          openSyncExceptions: 1,
          metrics: expect.objectContaining({
            activeOrders: 1,
            partiallyReadyOrders: 0,
            readyToServeOrders: 0,
          }),
          summary: [
            expect.objectContaining({
              orderId: "order_sync",
              reference: "Pedido Sync",
              hasOpenSyncException: true,
              syncException: expect.objectContaining({
                label: "Mudança externa",
              }),
            }),
          ],
        }),
      );
      expect("kitchens" in salonData).toBe(false);
      expect("syncAlerts" in salonData).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits the salão summary to the current operational day without trimming the dashboard queue", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T14:00:00.000Z"));

    const todayOlderAggregate = createAggregate("order_today_older");
    todayOlderAggregate.order.reference = "Pedido Hoje 100";
    todayOlderAggregate.order.createdAt = "2026-05-13T12:00:00.000Z";
    todayOlderAggregate.order.updatedAt = "2026-05-13T12:00:00.000Z";
    todayOlderAggregate.items[0]!.status = "ready";

    const todayNewerAggregate = createAggregate("order_today_newer");
    todayNewerAggregate.order.reference = "Pedido Hoje 200";
    todayNewerAggregate.order.createdAt = "2026-05-13T13:30:00.000Z";
    todayNewerAggregate.order.updatedAt = "2026-05-13T13:30:00.000Z";
    todayNewerAggregate.items[0]!.status = "ready";

    const previousDayAggregate = createAggregate("order_yesterday");
    previousDayAggregate.order.reference = "Pedido Ontem";
    previousDayAggregate.order.createdAt = "2026-05-12T23:30:00.000Z";
    previousDayAggregate.order.updatedAt = "2026-05-12T23:30:00.000Z";
    previousDayAggregate.items[0]!.status = "ready";

    const repository = createReadModelRepository({
      aggregate: todayOlderAggregate,
    });

    repository.listOrderAggregates = () => [
      previousDayAggregate,
      todayOlderAggregate,
      todayNewerAggregate,
    ];
    repository.getOrderAggregate = (requestedOrderId: string) =>
      [previousDayAggregate, todayOlderAggregate, todayNewerAggregate].find(
        (aggregate) => aggregate.order.id === requestedOrderId,
      );

    try {
      const salonData = getSalonData(repository);
      const dashboardData = getDashboardData(repository);
      const kitchenOneReadyColumn = dashboardData.kitchens
        .find((kitchen) => kitchen.id === "kitchen-1")
        ?.columns.find((column) => column.status === "ready");

      expect(salonData.summary.map((order) => order.orderId)).toEqual([
        "order_today_newer",
        "order_today_older",
      ]);
      expect(dashboardData.salonSummary.map((order) => order.orderId)).toEqual([
        "order_yesterday",
        "order_today_older",
        "order_today_newer",
      ]);
      expect(kitchenOneReadyColumn?.tickets.map((ticket) => ticket.orderId)).toEqual([
        "order_today_newer",
        "order_today_older",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

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

  it("keeps the production queue ordered by oldest orders first", () => {
    const newerAggregate = createAggregate("order_newer");
    newerAggregate.order.reference = "Pedido 200";
    newerAggregate.order.createdAt = "2026-05-11T12:10:00.000Z";
    newerAggregate.order.updatedAt = "2026-05-11T12:10:00.000Z";

    const olderAggregate = createAggregate("order_older");
    olderAggregate.order.reference = "Pedido 100";
    olderAggregate.order.createdAt = "2026-05-11T12:00:00.000Z";
    olderAggregate.order.updatedAt = "2026-05-11T12:00:00.000Z";

    const repository = createReadModelRepository({
      aggregate: newerAggregate,
    });

    repository.listOrderAggregates = () => [newerAggregate, olderAggregate];
    repository.getOrderAggregate = (requestedOrderId: string) =>
      [newerAggregate, olderAggregate].find(
        (aggregate) => aggregate.order.id === requestedOrderId,
      );

    const dashboard = getDashboardData(repository);
    const kitchenOneNewColumn = dashboard.kitchens
      .find((kitchen) => kitchen.id === "kitchen-1")
      ?.columns.find((column) => column.status === "new");
    const salonOrderIds = dashboard.salonSummary.map((order) => order.orderId);

    expect(kitchenOneNewColumn?.tickets.map((ticket) => ticket.orderId)).toEqual([
      "order_older",
      "order_newer",
    ]);
    expect(salonOrderIds).toEqual(["order_older", "order_newer"]);
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
        acknowledgedVia: "manager_ui",
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
          statusLabel: "Gestão ciente",
          summary: "Pedido 101 divergiu externamente após a importação",
        }),
      );
      expect(detail?.syncTrail).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: "acknowledged",
            label: "Gestão ciente",
            actor: "Gerência",
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

  it("marks removed provider items as canceled in the operational projection without rewriting the stored order", () => {
    const exception = createSyncException({
      details: {
        diffs: [
          {
            type: "item_removed",
            externalItemId: "drink",
          },
        ],
      },
    });
    const repository = createReadModelRepository({
      unresolvedExceptions: [exception],
    });

    const dashboard = getDashboardData(repository);
    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");
    const kitchen1Card = dashboard.kitchens
      .find((kitchen) => kitchen.id === "kitchen-1")
      ?.columns.flatMap((column) => column.tickets)
      .find((ticket) => ticket.orderId === "order_sync");

    expect(kitchen1Card).toEqual(
      expect.objectContaining({
        ticketStatus: "new",
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
    expect(detail).toEqual(
      expect.objectContaining({
        focusTicketStatus: "new",
        focusItems: [
          expect.objectContaining({
            name: "Café gelado",
            externalStatus: expect.objectContaining({
              kind: "canceled",
              label: "Cancelado",
            }),
          }),
        ],
      }),
    );
  });

  it("marks provider-added items as changed in the operational projection after the apply flow resolves", () => {
    const aggregate = createAggregate();
    aggregate.items[0]!.providerAddedAt = "2026-05-11T12:08:00.000Z";
    const repository = createReadModelRepository({
      aggregate,
    });

    const dashboard = getDashboardData(repository);
    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");
    const kitchen1Card = dashboard.kitchens
      .find((kitchen) => kitchen.id === "kitchen-1")
      ?.columns.flatMap((column) => column.tickets)
      .find((ticket) => ticket.orderId === "order_sync");

    expect(kitchen1Card).toEqual(
      expect.objectContaining({
        currentItems: [
          expect.objectContaining({
            name: "Café gelado",
            externalStatus: expect.objectContaining({
              kind: "changed",
              label: "Adicionado depois",
              detail: "Item incluído no pedido no provedor após a importação.",
            }),
          }),
        ],
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        focusItems: [
          expect.objectContaining({
            name: "Café gelado",
            externalStatus: expect.objectContaining({
              kind: "changed",
              label: "Adicionado depois",
            }),
          }),
        ],
      }),
    );
  });

  it("cancels only the matching item when the provider reused a duplicated line identifier", () => {
    const exception = createSyncException({
      details: {
        diffs: [
          {
            type: "item_removed",
            externalItemId: "0",
            matchKey: "route:iced-coffee",
            before: {
              menuItemId: "iced-coffee",
              name: "Café gelado",
            },
          },
        ],
      },
    });
    const aggregate = {
      ...createAggregate(),
      items: [
        {
          ...createAggregate().items[0]!,
          externalItemId: "0",
        },
        {
          ...createAggregate().items[1]!,
          externalItemId: "0",
        },
      ],
    };
    const repository = createReadModelRepository({
      aggregate,
      unresolvedExceptions: [exception],
    });

    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");
    const otherKitchenDetail = getOrderDetailData(
      repository,
      "order_sync",
      "kitchen-2",
    );

    expect(detail?.focusItems).toEqual([
      expect.objectContaining({
        name: "Café gelado",
        externalStatus: expect.objectContaining({
          kind: "canceled",
        }),
      }),
    ]);
    expect(otherKitchenDetail?.focusItems).toEqual([
      expect.objectContaining({
        name: "Croissant",
        externalStatus: null,
      }),
    ]);
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
        acknowledgedVia: "manager_ui",
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
            statusLabel: "Gestão ciente",
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
      replaceImportedOrder() {},
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
          detail: "Estado atual no provedor: cancelado.",
        }),
      ]),
    );
  });

  it("projects canceled_externally orders into canceled ticket and order statuses", () => {
    const exception = createSyncException({
      kind: "canceled_externally",
      summary: "Pedido Sync saiu de confirmed_ready no provedor",
      details: {
        providerStatus: "CANCELED",
      },
    });
    const repository = createReadModelRepository({
      unresolvedExceptions: [exception],
    });

    const dashboard = getDashboardData(repository);
    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");
    const kitchen1Canceled = dashboard.kitchens
      .find((kitchen) => kitchen.id === "kitchen-1")
      ?.columns.find((column) => column.status === "canceled")
      ?.tickets.find((ticket) => ticket.orderId === "order_sync");
    const salonOrder = dashboard.salonSummary.find(
      (order) => order.orderId === "order_sync",
    );

    expect(kitchen1Canceled).toEqual(
      expect.objectContaining({
        ticketStatus: "canceled",
        ticketStatusLabel: "Cancelado",
        orderStatus: "canceled",
        orderStatusLabel: "Cancelado",
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        focusTicketStatus: "canceled",
        focusKitchenStatus: "Cancelado",
        orderStatusKey: "canceled",
        orderStatus: "Cancelado",
      }),
    );
    expect(salonOrder).toEqual(
      expect.objectContaining({
        orderStatus: "Cancelado",
      }),
    );
  });

  it("projects finalized provider orders out of Novo even when local kitchen progress never started", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-11T14:00:00.000Z"));
    try {
      const aggregate = createAggregate();
      const providerState: ProviderOrderState = {
        provider: "anota_ai",
        externalOrderId: aggregate.order.externalId,
        providerStatus: "finalized",
        lifecycle: "confirmed_ready",
        snapshotHash: "hash-finalized",
        snapshot: {
          provider: "anota_ai",
          externalOrderId: aggregate.order.externalId,
          reference: aggregate.order.reference,
          customerName: aggregate.order.customerName ?? undefined,
          channel: "anotaai",
          providerStatus: "finalized",
          lifecycle: "confirmed_ready",
          providerUpdatedAt: "2026-05-11T12:10:00.000Z",
          items: [
            {
              externalItemId: "drink",
              catalogExternalId: "iced-coffee",
              name: "Café gelado",
              quantity: 1,
              modifiers: [],
            },
            {
              externalItemId: "bakery",
              catalogExternalId: "croissant",
              name: "Croissant",
              quantity: 1,
              modifiers: [],
            },
          ],
          rawPayload: {},
        },
        lastSeenAt: "2026-05-11T12:10:00.000Z",
        lastAppliedAt: "2026-05-11T12:10:00.000Z",
        importedOrderId: aggregate.order.id,
      };
      const repository = createReadModelRepository({
        aggregate,
        providerStates: [providerState],
      });

      const dashboard = getDashboardData(repository);
      const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");
      const kitchen1Ready = dashboard.kitchens
        .find((kitchen) => kitchen.id === "kitchen-1")
        ?.columns.find((column) => column.status === "ready")
        ?.tickets.find((ticket) => ticket.orderId === "order_sync");
      const salonOrder = dashboard.salonSummary.find(
        (order) => order.orderId === "order_sync",
      );

      expect(kitchen1Ready).toEqual(
        expect.objectContaining({
          ticketStatus: "ready",
          ticketStatusLabel: "Pronto",
          orderStatus: "ready_to_serve",
          orderStatusLabel: "Pronto para servir",
        }),
      );
      expect(detail).toEqual(
        expect.objectContaining({
          focusTicketStatus: "ready",
          focusKitchenStatus: "Pronto",
          orderStatusKey: "ready_to_serve",
          orderStatus: "Pronto para servir",
        }),
      );
      expect(salonOrder).toEqual(
        expect.objectContaining({
          orderStatus: "Pronto para servir",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("translates provider lifecycle codes in sync summaries", () => {
    const repository = createReadModelRepository({
      unresolvedExceptions: [
        createSyncException({
          kind: "canceled_externally",
          summary: "Pedido Sync saiu de confirmed_ready no provedor",
          details: {
            lifecycle: "confirmed_ready",
          },
        }),
      ],
    });

    const detail = getOrderDetailData(repository, "order_sync", "kitchen-1");

    expect(detail?.syncException).toEqual(
      expect.objectContaining({
        summary: "Pedido Sync saiu de confirmado para produção no provedor",
        detail: "Estado atual no provedor: confirmado para produção.",
      }),
    );
  });

  it("hides locally canceled orders from active sync alerts while preserving canceled detail data", () => {
    const aggregate = createAggregate("order_local_cancel");
    aggregate.order.reference = "Pedido localmente cancelado";
    aggregate.order.localCanceledAt = "2026-05-11T12:05:00.000Z";
    aggregate.order.localCanceledByAreaId = "kitchen-1";
    aggregate.order.localCanceledByRole = "manager";
    aggregate.order.localCancellationReason =
      "Webhook de cancelamento não recebido.";

    const repository = createReadModelRepository({
      aggregate,
      unresolvedExceptions: [
        createSyncException({
          externalOrderId: "local-cancel",
          orderId: "order_local_cancel",
          kind: "canceled_externally",
        }),
      ],
    });

    const dashboard = getDashboardData(repository);
    const detail = getOrderDetailData(
      repository,
      "order_local_cancel",
      "kitchen-1",
    );

    expect(dashboard.openSyncExceptions).toBe(0);
    expect(dashboard.syncAlerts).toEqual([]);
    expect(
      dashboard.kitchens
        .find((kitchen) => kitchen.id === "kitchen-1")
        ?.columns.find((column) => column.status === "canceled")
        ?.tickets.find((ticket) => ticket.orderId === "order_local_cancel"),
    ).toEqual(
      expect.objectContaining({
        localCancellation: expect.objectContaining({
          actor: "Gerência • Cozinha 1",
          reason: "Webhook de cancelamento não recebido.",
        }),
        ticketStatus: "canceled",
      }),
    );
    expect(detail).toEqual(
      expect.objectContaining({
        localCancellation: expect.objectContaining({
          label: "Retirado do fluxo",
          reason: "Webhook de cancelamento não recebido.",
        }),
        orderStatusKey: "canceled",
      }),
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
      replaceImportedOrder() {},
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
            localCanceledAt: null,
            localCanceledByAreaId: null,
            localCanceledByRole: null,
            localCancellationReason: null,
            source: "test",
            createdAt: "2026-05-11T10:00:00.000Z",
            updatedAt: "2026-05-11T10:00:00.000Z",
            waiterName: null,
          },
          items: [],
          tickets: [],
        };
      },
      updateItemStatus() {
        throw new Error("not implemented");
      },
      cancelOrderLocally() {
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
