export const kitchens = [
  { id: "kitchen-1", name: "Kitchen 1", description: "Drinks & Cold Line" },
  { id: "kitchen-2", name: "Kitchen 2", description: "Bakery & Hot Line" },
] as const;

export type KitchenId = (typeof kitchens)[number]["id"];

export const itemStatuses = ["new", "in_preparation", "ready"] as const;
export type ItemStatus = (typeof itemStatuses)[number];

export const ticketStatuses = ["new", "in_preparation", "ready", "canceled"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

export const orderStatuses = [
  "new",
  "in_progress",
  "partially_ready",
  "ready_to_serve",
  "canceled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  new: "Novo",
  in_preparation: "Em preparo",
  ready: "Pronto",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: "Novo",
  in_preparation: "Em preparo",
  ready: "Pronto",
  canceled: "Cancelado",
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Novo",
  in_progress: "Em andamento",
  partially_ready: "Parcialmente pronto",
  ready_to_serve: "Pronto para servir",
  canceled: "Cancelado",
};

export interface Kitchen {
  id: KitchenId;
  name: string;
  description: string;
}

export interface MenuItemKitchenMapping {
  menuItemId: string;
  menuItemName: string;
  kitchenId: KitchenId;
  providerItemId?: string | null;
  providerExternalId?: string | null;
}

export interface RawProviderOrderItemInput {
  externalItemId: string;
  menuItemId: string;
  providerItemId?: string | null;
  providerExternalId?: string | null;
  name: string;
  quantity: number;
  notes?: string;
}

export interface RawProviderOrderInput {
  externalId: string;
  reference: string;
  customerName?: string;
  waiterName?: string;
  channel: string;
  createdAt: string;
  items: RawProviderOrderItemInput[];
}

export interface OrderRecord {
  id: string;
  externalId: string;
  reference: string;
  customerName: string | null;
  waiterName: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  externalItemId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  kitchenId: KitchenId;
  status: ItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface KitchenTicketRecord {
  id: string;
  orderId: string;
  kitchenId: KitchenId;
  startedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderAggregate {
  order: OrderRecord;
  items: OrderItemRecord[];
  tickets: KitchenTicketRecord[];
}

export function isKitchenId(value: string): value is KitchenId {
  return kitchens.some((kitchen) => kitchen.id === value);
}

export function deriveTicketStatus(
  items: Pick<OrderItemRecord, "status">[],
  options: {
    hasStarted?: boolean;
  } = {},
): TicketStatus {
  if (items.length === 0) {
    return options.hasStarted ? "in_preparation" : "new";
  }

  const allReady = items.every((item) => item.status === "ready");
  if (allReady) {
    return "ready";
  }

  const allNew = items.every((item) => item.status === "new");
  if (allNew) {
    return options.hasStarted ? "in_preparation" : "new";
  }

  return "in_preparation";
}

export function deriveOrderStatus(
  tickets: Array<Pick<KitchenTicketRecord, "id"> & { status: TicketStatus }>,
): OrderStatus {
  if (tickets.length === 0) {
    return "new";
  }

  const allCanceled = tickets.every((ticket) => ticket.status === "canceled");
  if (allCanceled) {
    return "canceled";
  }

  const allNew = tickets.every((ticket) => ticket.status === "new");
  if (allNew) {
    return "new";
  }

  const allReady = tickets.every((ticket) => ticket.status === "ready");
  if (allReady) {
    return "ready_to_serve";
  }

  const oneReady = tickets.some((ticket) => ticket.status === "ready");
  if (oneReady) {
    return "partially_ready";
  }

  return "in_progress";
}
