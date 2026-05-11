import type {
  OrderProviderPort,
  OrderSyncProviderPort,
} from "@/src/application/ports";
import type { RawProviderOrderInput } from "@/src/domain/production";
import type {
  ListConfirmedOrdersInput,
  ProviderOrderSnapshot,
} from "@/src/domain/provider-sync";

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const mockRawOrders: RawProviderOrderInput[] = [
  {
    externalId: "anota-101",
    reference: "Pedido 101",
    customerName: "Mesa 4",
    channel: "mock-anota-ai",
    createdAt: minutesAgo(18),
    items: [
      {
        externalItemId: "101-1",
        menuItemId: "iced-coffee",
        name: "Café gelado",
        quantity: 2,
      },
      {
        externalItemId: "101-2",
        menuItemId: "orange-juice",
        name: "Suco de laranja",
        quantity: 1,
      },
      {
        externalItemId: "101-3",
        menuItemId: "croissant",
        name: "Croissant",
        quantity: 2,
      },
    ],
  },
  {
    externalId: "anota-102",
    reference: "Pedido 102",
    customerName: "Balcão",
    channel: "mock-anota-ai",
    createdAt: minutesAgo(12),
    items: [
      {
        externalItemId: "102-1",
        menuItemId: "cappuccino",
        name: "Cappuccino",
        quantity: 2,
      },
      {
        externalItemId: "102-2",
        menuItemId: "quiche-lorraine",
        name: "Quiche Lorraine",
        quantity: 1,
      },
    ],
  },
  {
    externalId: "anota-103",
    reference: "Pedido 103",
    customerName: "Mesa 7",
    channel: "mock-anota-ai",
    createdAt: minutesAgo(7),
    items: [
      {
        externalItemId: "103-1",
        menuItemId: "hibiscus-iced-tea",
        name: "Chá gelado de hibisco",
        quantity: 2,
      },
      {
        externalItemId: "103-2",
        menuItemId: "pain-au-chocolat",
        name: "Pain au chocolat",
        quantity: 1,
      },
      {
        externalItemId: "103-3",
        menuItemId: "brownie",
        name: "Brownie",
        quantity: 1,
      },
    ],
  },
  {
    externalId: "anota-104",
    reference: "Pedido 104",
    customerName: "Retirada",
    channel: "mock-anota-ai",
    createdAt: minutesAgo(3),
    items: [
      {
        externalItemId: "104-1",
        menuItemId: "sparkling-water",
        name: "Água com gás",
        quantity: 1,
      },
      {
        externalItemId: "104-2",
        menuItemId: "ham-cheese-toast",
        name: "Tostado de presunto e queijo",
        quantity: 2,
      },
    ],
  },
  {
    externalId: "anota-105",
    reference: "Pedido 105",
    customerName: "Mesa 2",
    channel: "mock-anota-ai",
    createdAt: minutesAgo(2),
    items: [
      {
        externalItemId: "105-1",
        menuItemId: "iced-coffee",
        name: "Café gelado",
        quantity: 1,
      },
      {
        externalItemId: "105-2",
        menuItemId: "orange-juice",
        name: "Suco de laranja",
        quantity: 1,
      },
    ],
  },
];

function cloneRawOrder(order: RawProviderOrderInput): RawProviderOrderInput {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
  };
}

function snapshotFromRawOrder(order: RawProviderOrderInput): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId: order.externalId,
    reference: order.reference,
    customerName: order.customerName,
    channel: order.channel,
    providerStatus: "in_production",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: order.createdAt,
    items: order.items.map((item) => ({
      externalItemId: item.externalItemId,
      catalogExternalId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: [],
    })),
    rawPayload: {
      id: order.externalId,
      items: order.items.map((item) => ({
        id: item.externalItemId,
        externalId: item.menuItemId,
      })),
    },
  };
}

function productionInputFromSnapshot(
  snapshot: ProviderOrderSnapshot,
): RawProviderOrderInput {
  return {
    externalId: snapshot.externalOrderId,
    reference: snapshot.reference,
    customerName: snapshot.customerName,
    channel: snapshot.channel,
    createdAt: snapshot.providerUpdatedAt,
    items: snapshot.items.map((item) => ({
      externalItemId: item.externalItemId,
      menuItemId: item.catalogExternalId ?? "",
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
}

export function listMockRawOrders() {
  return mockRawOrders.map(cloneRawOrder);
}

export function createMockOrderProvider(): OrderProviderPort {
  return {
    listOrders() {
      return listMockRawOrders();
    },
  };
}

export function createMockOrderSyncProvider(): OrderSyncProviderPort {
  return {
    providerName() {
      return "anota_ai";
    },
    async fetchOrderById(externalOrderId) {
      const order = mockRawOrders.find((entry) => entry.externalId === externalOrderId);

      return order ? snapshotFromRawOrder(order) : null;
    },
    async listConfirmedOrders(input: ListConfirmedOrdersInput) {
      const updatedSince = input.updatedSince
        ? Date.parse(input.updatedSince)
        : undefined;
      const snapshots = mockRawOrders
        .filter((order) => {
          if (typeof updatedSince !== "number") {
            return true;
          }

          return Date.parse(order.createdAt) >= updatedSince;
        })
        .map(snapshotFromRawOrder);

      if (typeof input.limit === "number") {
        return snapshots.slice(0, input.limit);
      }

      return snapshots;
    },
    toProductionInput(snapshot) {
      return productionInputFromSnapshot(snapshot);
    },
  };
}
