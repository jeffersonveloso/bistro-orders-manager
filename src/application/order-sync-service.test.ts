import { describe, expect, it } from "vitest";

import { syncOrders } from "@/src/application/order-sync-service";
import type { OrderProviderPort } from "@/src/application/ports";
import { createMockOrderProvider } from "@/src/infrastructure/mock-order-provider";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

describe("syncOrders", () => {
  it("imports valid orders and skips unmapped ones explicitly", () => {
    const provider: OrderProviderPort = {
      listOrders() {
        return [
          {
            externalId: "valid-1",
            reference: "Pedido Válido",
            channel: "test",
            createdAt: "2026-05-11T10:00:00.000Z",
            items: [
              {
                externalItemId: "item-1",
                menuItemId: "iced-coffee",
                name: "Café gelado",
                quantity: 1,
              },
            ],
          },
          {
            externalId: "invalid-1",
            reference: "Pedido Inválido",
            channel: "test",
            createdAt: "2026-05-11T10:05:00.000Z",
            items: [
              {
                externalItemId: "item-2",
                menuItemId: "not-mapped",
                name: "Sem mapeamento",
                quantity: 1,
              },
            ],
          },
        ];
      },
    };

    const context = createProductionTestContext();

    try {
      const result = syncOrders(context.repository, provider);

      expect(result.imported).toBe(1);
      expect(result.skipped).toEqual([
        {
          externalId: "invalid-1",
          reference: "Pedido Inválido",
          reason: "missing_kitchen_mapping",
          providerExternalId: "not-mapped",
          menuItemName: "Sem mapeamento",
        },
      ]);
      expect(context.repository.listOrderAggregates()).toHaveLength(1);
    } finally {
      context.close();
    }
  });

  it("keeps the existing mock provider flow compatible with the expanded ports", () => {
    const context = createProductionTestContext();

    try {
      const result = syncOrders(context.repository, createMockOrderProvider(), 2);

      expect(result.imported).toBe(2);
      expect(result.skipped).toEqual([]);
      expect(context.repository.listOrderAggregates()).toHaveLength(2);
    } finally {
      context.close();
    }
  });

  it("rethrows unexpected import errors instead of swallowing them", () => {
    const provider: OrderProviderPort = {
      listOrders() {
        return [
          {
            externalId: "valid-throw",
            reference: "Pedido com erro inesperado",
            channel: "test",
            createdAt: "2026-05-11T10:00:00.000Z",
            items: [
              {
                externalItemId: "item-1",
                menuItemId: "iced-coffee",
                name: "Café gelado",
                quantity: 1,
              },
            ],
          },
        ];
      },
    };

    const context = createProductionTestContext();
    const originalSaveImportedOrder = context.repository.saveImportedOrder.bind(
      context.repository,
    );
    const repository = {
      ...context.repository,
      saveImportedOrder() {
        originalSaveImportedOrder({
          order: {
            id: "noop",
            externalId: "noop",
            reference: "noop",
            customerName: null,
            waiterName: null,
            source: "test",
            createdAt: "2026-05-11T10:00:00.000Z",
            updatedAt: "2026-05-11T10:00:00.000Z",
          },
          items: [],
          tickets: [],
        });

        throw new Error("unexpected repository failure");
      },
    };

    try {
      expect(() => syncOrders(repository, provider)).toThrowError(
        "unexpected repository failure",
      );
    } finally {
      context.close();
    }
  });
});
