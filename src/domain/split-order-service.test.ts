import { describe, expect, it } from "vitest";

import {
  MissingKitchenMappingError,
  splitProviderOrder,
} from "@/src/domain/split-order-service";
import { listMockKitchenMappings } from "@/src/infrastructure/mock-order-provider";

const demoKitchenMappings = listMockKitchenMappings();

describe("splitProviderOrder", () => {
  it("splits a mixed order into kitchen-specific tickets", () => {
    const result = splitProviderOrder(
      {
        externalId: "demo-1",
        reference: "Pedido Demo 1",
        customerName: "Mesa Teste",
        channel: "test",
        createdAt: "2026-05-11T10:00:00.000Z",
        items: [
          {
            externalItemId: "item-1",
            menuItemId: "iced-coffee",
            name: "Café gelado",
            quantity: 1,
          },
          {
            externalItemId: "item-2",
            menuItemId: "croissant",
            name: "Croissant",
            quantity: 2,
          },
        ],
      },
      demoKitchenMappings,
    );

    expect(result.tickets).toHaveLength(2);
    expect(result.items.map((item) => item.kitchenId)).toEqual([
      "kitchen-1",
      "kitchen-2",
    ]);
  });

  it("creates a single ticket when all items belong to one kitchen", () => {
    const result = splitProviderOrder(
      {
        externalId: "demo-2",
        reference: "Pedido Demo 2",
        channel: "test",
        createdAt: "2026-05-11T10:00:00.000Z",
        items: [
          {
            externalItemId: "item-1",
            menuItemId: "iced-coffee",
            name: "Café gelado",
            quantity: 1,
          },
          {
            externalItemId: "item-2",
            menuItemId: "orange-juice",
            name: "Suco de laranja",
            quantity: 1,
          },
        ],
      },
      demoKitchenMappings,
    );

    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]?.kitchenId).toBe("kitchen-1");
  });

  it("matches provider catalog ids while persisting the local item id", () => {
    const result = splitProviderOrder(
      {
        externalId: "demo-2b",
        reference: "Pedido Demo 2B",
        channel: "test",
        createdAt: "2026-05-11T10:00:00.000Z",
        items: [
          {
            externalItemId: "item-1",
            menuItemId: "provider-croissant",
            name: "Croissant",
            quantity: 1,
          },
        ],
      },
      [
        {
          kitchenId: "kitchen-2",
          menuItemId: "local-croissant-id",
          menuItemName: "Croissant",
          providerExternalId: "provider-croissant",
        },
      ],
    );

    expect(result.items[0]?.kitchenId).toBe("kitchen-2");
    expect(result.items[0]?.menuItemId).toBe("local-croissant-id");
  });

  it("falls back to provider item id when the order line has no external routing key", () => {
    const result = splitProviderOrder(
      {
        externalId: "demo-2c",
        reference: "Pedido Demo 2C",
        channel: "test",
        createdAt: "2026-05-11T10:00:00.000Z",
        items: [
          {
            externalItemId: "item-1",
            menuItemId: "provider-item-cappuccino",
            providerItemId: "provider-item-cappuccino",
            providerExternalId: null,
            name: "Cappuccino",
            quantity: 1,
          },
        ],
      },
      [
        {
          kitchenId: "kitchen-1",
          menuItemId: "local-cappuccino-id",
          menuItemName: "Cappuccino",
          providerItemId: "provider-item-cappuccino",
        },
      ],
    );

    expect(result.items[0]?.kitchenId).toBe("kitchen-1");
    expect(result.items[0]?.menuItemId).toBe("local-cappuccino-id");
  });

  it("throws an explicit error for unmapped menu items", () => {
    expect(() =>
      splitProviderOrder(
        {
          externalId: "demo-3",
          reference: "Pedido Demo 3",
          channel: "test",
          createdAt: "2026-05-11T10:00:00.000Z",
          items: [
            {
              externalItemId: "item-1",
              menuItemId: "unknown-item",
              name: "Item sem mapeamento",
              quantity: 1,
            },
          ],
        },
        demoKitchenMappings,
      ),
    ).toThrowError(MissingKitchenMappingError);
  });
});
