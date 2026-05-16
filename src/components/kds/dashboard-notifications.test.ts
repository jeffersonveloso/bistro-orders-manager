import { describe, expect, it } from "vitest";

import type { DashboardData } from "@/src/application/production-service";
import {
  acknowledgeTrackedKitchenOrder,
  collectTrackedKitchenOrderIds,
  diffNewTrackedKitchenOrderIds,
  mergeTrackedKitchenOrderIds,
} from "@/src/components/kds/dashboard-notifications";

function buildBoardData(): DashboardData {
  return {
    generatedAt: "2026-05-15T12:00:00.000Z",
    metrics: {
      activeOrders: 3,
      partiallyReadyOrders: 1,
      readyToServeOrders: 1,
    },
    openSyncExceptions: 0,
    salonSummary: [],
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
            tickets: [
              {
                orderId: "order-101",
                ticketId: "ticket-101-k1",
                kitchenId: "kitchen-1",
                kitchenName: "Kitchen 1",
                reference: "Pedido 101",
                customerName: "Mesa 1",
                waiterName: "Clara",
                ticketStatus: "new",
                ticketStatusLabel: "Novo",
                orderStatus: "new",
                orderStatusLabel: "Novo",
                ageLabel: "2 min",
                currentItems: [],
                otherKitchenStatus: "Novo",
                otherKitchenName: "Kitchen 2",
                hasOpenSyncException: false,
                syncExceptionLabel: null,
                syncExceptionStatusLabel: null,
              },
            ],
          },
          {
            status: "in_preparation",
            label: "Em preparo",
            tickets: [
              {
                orderId: "order-102",
                ticketId: "ticket-102-k1",
                kitchenId: "kitchen-1",
                kitchenName: "Kitchen 1",
                reference: "Pedido 102",
                customerName: "Mesa 2",
                waiterName: "Joana",
                ticketStatus: "in_preparation",
                ticketStatusLabel: "Em preparo",
                orderStatus: "in_progress",
                orderStatusLabel: "Em andamento",
                ageLabel: "4 min",
                currentItems: [],
                otherKitchenStatus: null,
                otherKitchenName: null,
                hasOpenSyncException: false,
                syncExceptionLabel: null,
                syncExceptionStatusLabel: null,
              },
            ],
          },
          {
            status: "ready",
            label: "Pronto",
            tickets: [
              {
                orderId: "order-101",
                ticketId: "ticket-101-k1-ready-duplicate-order",
                kitchenId: "kitchen-1",
                kitchenName: "Kitchen 1",
                reference: "Pedido 101",
                customerName: "Mesa 1",
                waiterName: "Clara",
                ticketStatus: "ready",
                ticketStatusLabel: "Pronto",
                orderStatus: "partially_ready",
                orderStatusLabel: "Parcialmente pronto",
                ageLabel: "6 min",
                currentItems: [],
                otherKitchenStatus: "Pronto",
                otherKitchenName: "Kitchen 2",
                hasOpenSyncException: false,
                syncExceptionLabel: null,
                syncExceptionStatusLabel: null,
              },
            ],
          },
          {
            status: "canceled",
            label: "Cancelado",
            tickets: [],
          },
        ],
      },
      {
        id: "kitchen-2",
        name: "Kitchen 2",
        description: "Hot line",
        columns: [
          {
            status: "new",
            label: "Novo",
            tickets: [
              {
                orderId: "order-201",
                ticketId: "ticket-201-k2",
                kitchenId: "kitchen-2",
                kitchenName: "Kitchen 2",
                reference: "Pedido 201",
                customerName: "Mesa 9",
                waiterName: "Rafael",
                ticketStatus: "new",
                ticketStatusLabel: "Novo",
                orderStatus: "new",
                orderStatusLabel: "Novo",
                ageLabel: "1 min",
                currentItems: [],
                otherKitchenStatus: null,
                otherKitchenName: null,
                hasOpenSyncException: false,
                syncExceptionLabel: null,
                syncExceptionStatusLabel: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("dashboard notification helpers", () => {
  it("tracks unique order ids only for the active kitchen board", () => {
    expect(collectTrackedKitchenOrderIds(buildBoardData(), "kitchen-1")).toEqual([
      "order-101",
      "order-102",
    ]);
    expect(collectTrackedKitchenOrderIds(buildBoardData(), "kitchen-2")).toEqual([
      "order-201",
    ]);
  });

  it("detects only the orders that were not present in the previous snapshot", () => {
    expect(
      diffNewTrackedKitchenOrderIds(
        ["order-101", "order-102"],
        ["order-101", "order-102", "order-103", "order-104"],
      ),
    ).toEqual(["order-103", "order-104"]);
  });

  it("merges and acknowledges tracked ids without duplicating order notifications", () => {
    const merged = mergeTrackedKitchenOrderIds(
      ["order-101"],
      ["order-101", "order-103", "order-104"],
    );

    expect(merged).toEqual(["order-101", "order-103", "order-104"]);
    expect(acknowledgeTrackedKitchenOrder(merged, "order-103")).toEqual([
      "order-101",
      "order-104",
    ]);
  });
});
