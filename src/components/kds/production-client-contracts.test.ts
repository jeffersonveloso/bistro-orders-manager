import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type DashboardData,
  getDashboardData,
  getOrderDetailData,
  getSalonData,
} from "@/src/application/production-service";
import { DashboardClient } from "@/src/components/kds/dashboard-client";
import { OrderDetailClient } from "@/src/components/kds/order-detail-client";
import {
  getDashboardInvalidationKeys,
  getSalonQueryOptions,
} from "@/src/components/kds/production-client-contracts";
import { ReadyStatusRevertDialog } from "@/src/components/kds/ready-status-revert-dialog";
import { SalonClient } from "@/src/components/kds/salon-client";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

function renderClient(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      {
        client: new QueryClient(),
      },
      element,
    ),
  );
}

describe("production client contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches salão reads from /api/salon", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: "2026-05-13T12:00:00.000Z",
          metrics: {
            activeOrders: 1,
            partiallyReadyOrders: 0,
            readyToServeOrders: 0,
          },
          openSyncExceptions: 0,
          summary: [],
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await getSalonQueryOptions().queryFn();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/salon",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps order-detail invalidation aligned with protected board and order keys", () => {
    expect(getDashboardInvalidationKeys("order_anota-101", "kitchen-1")).toEqual([
      ["board"],
      ["order", "order_anota-101", "kitchen-1"],
    ]);
  });

  it("keeps catalog access on the dashboard without rendering wrong-area shortcuts", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const markup = renderClient(
        createElement(DashboardClient, {
          activeKitchenId: "kitchen-1",
          initialData: getDashboardData(context.repository),
        }),
      );

      expect(markup).toContain("/catalog");
      expect(markup).not.toContain("/salon");
    } finally {
      context.close();
    }
  });

  it("renders a switch-area action on dashboard, salon, and order-detail surfaces", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const orderDetailData = getOrderDetailData(
        context.repository,
        "order_anota-101",
        "kitchen-1",
      );

      if (!orderDetailData) {
        throw new Error("Expected order detail data for regression test");
      }

      const dashboardMarkup = renderClient(
        createElement(DashboardClient, {
          activeKitchenId: "kitchen-1",
          initialData: getDashboardData(context.repository),
        }),
      );
      const salonMarkup = renderClient(
        createElement(SalonClient, {
          initialData: getSalonData(context.repository),
        }),
      );
      const orderDetailMarkup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
        }),
      );

      expect(dashboardMarkup).toContain('data-testid="switch-area-action"');
      expect(dashboardMarkup).toContain('data-testid="open-catalog-action"');
      expect(dashboardMarkup).toContain('data-testid="board-toggle-filters"');
      expect(dashboardMarkup).toContain('data-testid="board-new-orders-badge"');
      expect(dashboardMarkup).toContain('data-testid="board-toggle-order-bell"');
      expect(dashboardMarkup).not.toContain("Campainha desligada");
      expect(salonMarkup).toContain('data-testid="switch-area-action"');
      expect(orderDetailMarkup).toContain('data-testid="open-catalog-action"');
      expect(orderDetailMarkup).toContain('data-testid="switch-area-action"');
      expect(orderDetailMarkup).toContain(
        'data-testid="order-detail-toggle-other-kitchen"',
      );
    } finally {
      context.close();
    }
  });

  it("preserves the current dashboard filters in the order-detail back link", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const orderDetailData = getOrderDetailData(
        context.repository,
        "order_anota-101",
        "kitchen-1",
      );

      if (!orderDetailData) {
        throw new Error("Expected order detail data for return link regression");
      }

      const markup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
          returnTo: "/?customer=Mesa%207&reference=103&pageSize=8",
        }),
      );

      expect(markup).toContain('data-testid="order-detail-back-link"');
      expect(markup).toContain(
        'href="/?customer=Mesa%207&amp;reference=103&amp;pageSize=8"',
      );
    } finally {
      context.close();
    }
  });

  it("renders waiter metadata on dashboard and order-detail surfaces", () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const dashboardData = getDashboardData(context.repository);
      const orderDetailData = getOrderDetailData(
        context.repository,
        "order_anota-101",
        "kitchen-1",
      );

      if (!orderDetailData) {
        throw new Error("Expected order detail data for waiter regression");
      }

      const kitchenBoard = dashboardData.kitchens.find(
        (kitchen) => kitchen.id === "kitchen-1",
      );
      const hiddenNewColumn = kitchenBoard?.columns.find(
        (column) => column.status === "new",
      );
      const visibleReadyColumn = kitchenBoard?.columns.find(
        (column) => column.status === "ready",
      );
      const visibleDashboardTicket = hiddenNewColumn?.tickets.at(0) ?? null;

      if (!hiddenNewColumn || !visibleReadyColumn || !visibleDashboardTicket) {
        throw new Error("Expected dashboard ticket data for waiter regression");
      }

      hiddenNewColumn.tickets = hiddenNewColumn.tickets.filter(
        (ticket) => ticket !== visibleDashboardTicket,
      );
      visibleDashboardTicket.ticketStatus = "ready";
      visibleDashboardTicket.ticketStatusLabel = "Pronto";
      visibleDashboardTicket.orderStatus = "in_progress";
      visibleDashboardTicket.orderStatusLabel = "Em andamento";
      visibleDashboardTicket.waiterName = "Clara";
      visibleReadyColumn.tickets.unshift(visibleDashboardTicket);

      const dashboardMarkup = renderClient(
        createElement(DashboardClient, {
          activeKitchenId: "kitchen-1",
          initialData: dashboardData,
        }),
      );
      const orderDetailMarkup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
        }),
      );

      expect(dashboardMarkup).toContain("Garçom Clara");
      expect(orderDetailMarkup).toContain("Garçom");
      expect(orderDetailMarkup).toContain("Clara");
    } finally {
      context.close();
    }
  });

  it("renders item observations on the dashboard and order-detail surfaces from the observation field", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const orderDetailData = getOrderDetailData(
        context.repository,
        "order_anota-101",
        "kitchen-1",
      );

      if (!orderDetailData || !orderDetailData.otherKitchen) {
        throw new Error("Expected mixed-kitchen order detail data for observation regression");
      }

      const dashboardData = getDashboardData(context.repository);
      const dashboardItem =
        dashboardData.kitchens
          .flatMap((kitchen) => kitchen.columns)
          .filter((column) => column.status !== "new" && column.status !== "canceled")
          .flatMap((column) => column.tickets)
          .flatMap((ticket) => ticket.currentItems)
          .find((item) => item.notes || item.observation || item.name.length > 0) ?? null;

      if (!dashboardItem) {
        throw new Error("Expected dashboard item data for observation regression");
      }

      orderDetailData.focusItems[0].notes = null;
      orderDetailData.focusItems[0].observation = "Sem gelo";
      orderDetailData.otherKitchen.items[0].notes = null;
      orderDetailData.otherKitchen.items[0].observation = "Aquecer antes de sair";
      dashboardItem.notes = null;
      dashboardItem.observation = "Sem gelo";

      const dashboardMarkup = renderClient(
        createElement(DashboardClient, {
          activeKitchenId: "kitchen-1",
          initialData: dashboardData,
        }),
      );

      const orderDetailMarkup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
        }),
      );

      expect(dashboardMarkup).toContain("Observação");
      expect(dashboardMarkup).toContain("Sem gelo");
      expect(orderDetailMarkup).toContain("Observação");
      expect(orderDetailMarkup).toContain("Sem gelo");
      expect(orderDetailMarkup).toContain("Aquecer antes de sair");
    } finally {
      context.close();
    }
  });

  it("renders a confirmation dialog for ready-item reversions", () => {
    const markup = renderClient(
      createElement(ReadyStatusRevertDialog, {
        isOpen: true,
        itemName: "Croissant",
        nextStatus: "in_preparation",
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="ready-status-revert-dialog"');
    expect(markup).toContain("Reverter item pronto");
    expect(markup).toContain("Croissant");
    expect(markup).toContain("Pronto");
    expect(markup).toContain("Em preparo");
    expect(markup).toContain('data-testid="ready-status-revert-confirm"');
    expect(markup).toContain('data-testid="ready-status-revert-cancel"');
  });

  it("renders reversible item actions on the order-detail surface for correction flows", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const orderDetailData = getOrderDetailData(
        context.repository,
        "order_anota-101",
        "kitchen-1",
      );

      if (!orderDetailData) {
        throw new Error("Expected order detail data for item correction regression");
      }

      const prepItem = orderDetailData.focusItems.find(
        (item) => item.id === "order_anota-101__101-1",
      );
      const readyItem = orderDetailData.focusItems.find(
        (item) => item.id === "order_anota-101__101-2",
      );

      if (!prepItem || !readyItem) {
        throw new Error("Expected focus items for correction regression");
      }

      prepItem.status = "in_preparation";
      readyItem.status = "ready";

      const markup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
        }),
      );

      expect(markup).toContain('data-testid="item-action-back-to-new-order_anota-101__101-1"');
      expect(markup).toContain("Voltar para novo");
      expect(markup).toContain('data-testid="item-action-mark-ready-order_anota-101__101-1"');
      expect(markup).toContain('data-testid="item-action-back-to-preparation-order_anota-101__101-2"');
      expect(markup).toContain("Voltar para preparo");
    } finally {
      context.close();
    }
  });

  it("groups the salão queue by preparation and delivery while limiting each section to fifteen orders", () => {
    const initialData = {
      generatedAt: "2026-05-13T12:00:00.000Z",
      metrics: {
        activeOrders: 10,
        partiallyReadyOrders: 2,
        readyToServeOrders: 2,
      },
      openSyncExceptions: 0,
      summary: [
        ...Array.from({ length: 16 }, (_, index) => ({
          orderId: `prep-${index + 1}`,
          reference: `Comanda ${index + 1}`,
          customerName: `Mesa preparo ${index + 1}`,
          waiterName: `Garçom ${index + 1}`,
          orderStatus: index === 0 ? "Parcialmente pronto" : "Em andamento",
          hasOpenSyncException: false,
          syncExceptionLabel: null,
          syncException: null,
          ticketBreakdown: [],
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          orderId: `ready-${index + 1}`,
          reference: `Entrega ${index + 1}`,
          customerName: `Mesa pronta ${index + 1}`,
          waiterName: `Garçom pronta ${index + 1}`,
          orderStatus: "Pronto para servir",
          hasOpenSyncException: false,
          syncExceptionLabel: null,
          syncException: null,
          ticketBreakdown: [],
        })),
      ],
    };

    const markup = renderClient(
      createElement(SalonClient, {
        initialData,
      }),
    );

    expect(markup).toContain('data-testid="salon-section-in-preparation"');
    expect(markup).toContain('data-testid="salon-section-ready"');
    expect(markup).toContain('data-testid="salon-toggle-section-in_preparation"');
    expect(markup).toContain("Pronto para entrega");
    expect(markup).toContain("Mesa preparo 15");
    expect(markup).not.toContain("Mesa preparo 16");
    expect(markup).toContain("+1 pedido(s) fora da tela");
    expect(markup).toContain("Ver pedidos fora da tela");
    expect(markup).toContain("Mesa pronta 1");
    expect(markup).toContain("Mesa pronta 2");
  });

  it("renders visibility toggles, keeps active alert states explicit, and hides non-operational columns by default", () => {
    const makeTicket = (index: number, status: "new" | "canceled" = "new") => ({
      orderId: `order-${index}`,
      ticketId: `ticket-${index}`,
      kitchenId: "kitchen-1" as const,
      kitchenName: "Kitchen 1",
      reference: `Pedido ${index}`,
      customerName: `Mesa ${index}`,
      waiterName: `Garçom ${index}`,
      ticketStatus: status,
      ticketStatusLabel: status === "canceled" ? "Cancelado" : "Novo",
      orderStatus: status === "canceled" ? "canceled" : "new",
      orderStatusLabel: status === "canceled" ? "Cancelado" : "Novo",
      ageLabel: `${index} min`,
      currentItems: [],
      otherKitchenStatus: null,
      otherKitchenName: null,
      hasOpenSyncException: false,
      syncExceptionLabel: null,
      syncExceptionStatusLabel: null,
    });

    const initialData: DashboardData = {
      generatedAt: "2026-05-13T12:00:00.000Z",
      metrics: {
        activeOrders: 6,
        partiallyReadyOrders: 0,
        readyToServeOrders: 0,
      },
      openSyncExceptions: 1,
      salonSummary: Array.from({ length: 7 }, (_, index) => ({
        orderId: `order-${index + 1}`,
        reference: `Pedido ${index + 1}`,
        customerName: `Mesa ${index + 1}`,
        waiterName: `Garçom ${index + 1}`,
        orderStatus: "Novo",
        hasOpenSyncException: false,
        syncExceptionLabel: null,
        syncException: null,
        ticketBreakdown: [],
      })),
      syncAlerts: [
        {
          id: "sync-alert-1",
          label: "Mudança externa",
          statusLabel: "Ação pendente",
          summary: "O pedido foi alterado no provedor e precisa de conferência.",
          detail: "Item removido na plataforma externa.",
          status: "open",
          orderId: "order-2",
          externalOrderId: "provider-2",
          reference: "Pedido 2",
          customerName: "Mesa 2",
          waiterName: "Garçom 2",
          focusKitchenId: "kitchen-1",
          detectedAt: "2026-05-13T12:00:00.000Z",
          lastSeenAt: "2026-05-13T12:01:00.000Z",
        },
      ],
      kitchens: [
        {
          id: "kitchen-1",
          name: "Kitchen 1",
          description: "Cold line",
          columns: [
            {
              status: "new",
              label: "Novo",
              tickets: Array.from({ length: 6 }, (_, index) =>
                makeTicket(index + 1),
              ),
            },
            {
              status: "in_preparation",
              label: "Em preparo",
              tickets: [],
            },
            {
              status: "ready",
              label: "Pronto",
              tickets: [],
            },
            {
              status: "canceled",
              label: "Cancelado",
              tickets: [makeTicket(99, "canceled")],
            },
          ],
        },
      ],
    };

    const markup = renderClient(
      createElement(DashboardClient, {
        activeKitchenId: "kitchen-1",
        initialData,
      }),
    );

    expect(markup).not.toContain('data-testid="board-column-kitchen-1-new"');
    expect(markup).not.toContain('data-testid="board-column-kitchen-1-canceled"');
    expect(markup).toContain('data-testid="board-toggle-column-new"');
    expect(markup).toContain('data-testid="board-toggle-column-canceled"');
    expect(markup).toContain('data-testid="board-toggle-sync-alerts"');
    expect(markup).toContain("Alertas visíveis");
    expect(markup).toContain('data-testid="board-sync-alerts"');
    expect(markup).toContain('data-testid="board-toggle-kitchen-kitchen-1"');
    expect(markup).toContain("Cozinha 1");
    expect(markup).not.toContain("Kitchen 1");
  });
});
