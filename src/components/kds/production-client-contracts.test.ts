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

  it("renders item observations on the order-detail surface from the observation field", () => {
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

      orderDetailData.focusItems[0].notes = null;
      orderDetailData.focusItems[0].observation = "Sem gelo";
      orderDetailData.otherKitchen.items[0].notes = null;
      orderDetailData.otherKitchen.items[0].observation = "Aquecer antes de sair";

      const markup = renderClient(
        createElement(OrderDetailClient, {
          initialData: orderDetailData,
          kitchenId: "kitchen-1",
          orderId: "order_anota-101",
        }),
      );

      expect(markup).toContain("Observação");
      expect(markup).toContain("Sem gelo");
      expect(markup).toContain("Aquecer antes de sair");
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

  it("renders visibility toggles, hides the canceled column by default, and paginates ticket lists", () => {
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
      openSyncExceptions: 0,
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
      syncAlerts: [],
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

    expect(markup).not.toContain('data-testid="board-column-kitchen-1-canceled"');
    expect(markup).toContain('data-testid="board-toggle-column-canceled"');
    expect(markup).toContain('data-testid="board-toggle-kitchen-kitchen-1"');
    expect(markup).toContain('data-testid="board-column-page-kitchen-1-new"');
    expect(markup).toContain("Mostrando 1-4 de 6");
    expect(markup).toContain("Cozinha 1");
    expect(markup).not.toContain("Kitchen 1");
  });
});
