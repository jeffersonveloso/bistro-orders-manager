import type {
  CatalogAdminProviderPort,
  OrderProviderPort,
  OrderSyncProviderPort,
} from "@/src/application/ports";
import type {
  MenuItemKitchenMapping,
  RawProviderOrderInput,
} from "@/src/domain/production";
import type {
  ListCatalogItemsInput,
  ListConfirmedOrdersInput,
  ProviderCatalogItem,
  ProviderOrderSnapshot,
} from "@/src/domain/provider-sync";

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

const mockKitchenMappings: MenuItemKitchenMapping[] = [
  {
    menuItemId: "iced-coffee",
    menuItemName: "Café gelado",
    kitchenId: "kitchen-1",
    providerItemId: "mock-item-iced-coffee",
    providerExternalId: "iced-coffee",
  },
  {
    menuItemId: "orange-juice",
    menuItemName: "Suco de laranja",
    kitchenId: "kitchen-1",
    providerItemId: "mock-item-orange-juice",
    providerExternalId: "orange-juice",
  },
  {
    menuItemId: "cappuccino",
    menuItemName: "Cappuccino",
    kitchenId: "kitchen-1",
    providerItemId: "mock-item-cappuccino",
    providerExternalId: "cappuccino",
  },
  {
    menuItemId: "hibiscus-iced-tea",
    menuItemName: "Chá gelado de hibisco",
    kitchenId: "kitchen-1",
    providerItemId: "mock-item-hibiscus-iced-tea",
    providerExternalId: "hibiscus-iced-tea",
  },
  {
    menuItemId: "sparkling-water",
    menuItemName: "Água com gás",
    kitchenId: "kitchen-1",
    providerItemId: "mock-item-sparkling-water",
    providerExternalId: "sparkling-water",
  },
  {
    menuItemId: "croissant",
    menuItemName: "Croissant",
    kitchenId: "kitchen-2",
    providerItemId: "mock-item-croissant",
    providerExternalId: "croissant",
  },
  {
    menuItemId: "quiche-lorraine",
    menuItemName: "Quiche Lorraine",
    kitchenId: "kitchen-2",
    providerItemId: "mock-item-quiche-lorraine",
    providerExternalId: "quiche-lorraine",
  },
  {
    menuItemId: "pain-au-chocolat",
    menuItemName: "Pain au chocolat",
    kitchenId: "kitchen-2",
    providerItemId: "mock-item-pain-au-chocolat",
    providerExternalId: "pain-au-chocolat",
  },
  {
    menuItemId: "brownie",
    menuItemName: "Brownie",
    kitchenId: "kitchen-2",
    providerItemId: "mock-item-brownie",
    providerExternalId: "brownie",
  },
  {
    menuItemId: "ham-cheese-toast",
    menuItemName: "Tostado de presunto e queijo",
    kitchenId: "kitchen-2",
    providerItemId: "mock-item-ham-cheese-toast",
    providerExternalId: "ham-cheese-toast",
  },
];

const mockRawOrders: RawProviderOrderInput[] = [
  {
    externalId: "anota-101",
    reference: "Pedido 101",
    customerName: "Mesa 4",
    waiterName: "Clara",
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
    waiterName: "Vinicius",
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
    waiterName: "Joana",
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
    waiterName: "Rafael",
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
    waiterName: "Clara",
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

const mockCatalogItems: ProviderCatalogItem[] = [
  ...mockKitchenMappings.map((mapping, index) => ({
    provider: "anota_ai" as const,
    providerItemId: mapping.providerItemId ?? `mock-provider-item-${index + 1}`,
    providerExternalId: mapping.providerExternalId ?? null,
    name: mapping.menuItemName,
    updatedAt: minutesAgo(120 - index),
    rawPayload: {
      id: mapping.providerItemId ?? `mock-provider-item-${index + 1}`,
      externalId: mapping.providerExternalId ?? null,
      name: mapping.menuItemName,
    },
  })),
  {
    provider: "anota_ai",
    providerItemId: "mock-item-club-sandwich",
    providerExternalId: "club-sandwich",
    name: "Club Sandwich",
    updatedAt: minutesAgo(6),
    rawPayload: {
      id: "mock-item-club-sandwich",
      externalId: "club-sandwich",
      name: "Club Sandwich",
    },
  },
  {
    provider: "anota_ai",
    providerItemId: "mock-item-secret-cake",
    providerExternalId: null,
    name: "Bolo secreto",
    updatedAt: minutesAgo(4),
    rawPayload: {
      id: "mock-item-secret-cake",
      name: "Bolo secreto",
    },
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
    waiterName: order.waiterName,
    channel: order.channel,
    providerStatus: "in_production",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: order.createdAt,
    items: order.items.map((item) => ({
      externalItemId: item.externalItemId,
      providerItemId: `mock-item-${item.menuItemId}`,
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
    waiterName: snapshot.waiterName,
    channel: snapshot.channel,
    createdAt: snapshot.providerUpdatedAt,
    items: snapshot.items.map((item) => ({
      externalItemId: item.externalItemId,
      menuItemId: item.catalogExternalId ?? item.providerItemId ?? "",
      providerItemId: item.providerItemId ?? null,
      providerExternalId: item.catalogExternalId ?? null,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    })),
  };
}

export function listMockRawOrders() {
  return mockRawOrders.map(cloneRawOrder);
}

export function listMockKitchenMappings() {
  return mockKitchenMappings.map((mapping) => ({ ...mapping }));
}

export function createMockOrderProvider(): OrderProviderPort {
  return {
    listOrders() {
      return listMockRawOrders();
    },
  };
}

export function createMockCatalogAdminProvider(): CatalogAdminProviderPort {
  return {
    providerName() {
      return "anota_ai";
    },
    getCatalogExternalIdSupport() {
      return {
        provider: "anota_ai",
        providerLabel: "Provider configurado",
        mode: "manual_assist",
        actionLabel: "Publicar manualmente no provider",
        summary:
          "O MVP gera o ID do bistrô e prepara o binding local. A publicação do external ID no provider continua assistida.",
        helpUrl: null,
        instructions: [
          "Copie o ID gerado pelo bistrô.",
          "Abra o item correspondente no catálogo do provider.",
          "Preencha o campo de external ID com esse valor e salve.",
          "Depois rode um novo pull ou reconciliação para validar a leitura.",
        ],
      };
    },
    async listCatalogItems(input: ListCatalogItemsInput) {
      const updatedSince = input.updatedSince
        ? Date.parse(input.updatedSince)
        : undefined;
      const items = mockCatalogItems
        .filter((item) => {
          if (typeof updatedSince !== "number") {
            return true;
          }

          return Date.parse(item.updatedAt) >= updatedSince;
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .map((item) => ({
          ...item,
          rawPayload:
            item.rawPayload &&
            typeof item.rawPayload === "object" &&
            !Array.isArray(item.rawPayload)
              ? { ...item.rawPayload }
              : item.rawPayload,
        }));

      if (typeof input.limit === "number") {
        return items.slice(0, input.limit);
      }

      return items;
    },
    async publishExternalId() {
      return {
        status: "skipped",
        providerMessage:
          "O provider mock usa publicação assistida e não persiste external IDs remotamente.",
      };
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
