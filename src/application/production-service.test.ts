import { describe, expect, it, vi } from "vitest";

import {
  getDashboardData,
  getOrderDetailData,
} from "@/src/application/production-service";
import type { ProductionRepository } from "@/src/application/ports";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

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
