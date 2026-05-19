import type {
  KitchenTicketRecord,
  MenuItemKitchenMapping,
  OrderItemRecord,
  OrderRecord,
  RawProviderOrderInput,
} from "@/src/domain/production";

export interface SplitOrderResult {
  order: OrderRecord;
  items: OrderItemRecord[];
  tickets: KitchenTicketRecord[];
}

export class MissingKitchenMappingError extends Error {
  readonly providerExternalId: string;
  readonly providerRoutingKey: string;
  readonly menuItemName: string;

  constructor(providerRoutingKey: string, menuItemName: string) {
    super(
      `Missing kitchen mapping for provider routing key "${providerRoutingKey}"`,
    );
    this.name = "MissingKitchenMappingError";
    this.providerExternalId = providerRoutingKey;
    this.providerRoutingKey = providerRoutingKey;
    this.menuItemName = menuItemName;
  }
}

export function splitProviderOrder(
  input: RawProviderOrderInput,
  mappings: MenuItemKitchenMapping[],
): SplitOrderResult {
  const mappingsByLocalMenuItemId = new Map(
    mappings.map((mapping) => [mapping.menuItemId, mapping]),
  );
  const mappingsByProviderExternalId = new Map(
    mappings
      .filter(
        (mapping) =>
          typeof mapping.providerExternalId === "string" &&
          mapping.providerExternalId.trim().length > 0,
      )
      .map((mapping) => [mapping.providerExternalId as string, mapping]),
  );
  const mappingsByProviderItemId = new Map(
    mappings
      .filter(
        (mapping) =>
          typeof mapping.providerItemId === "string" &&
          mapping.providerItemId.trim().length > 0,
      )
      .map((mapping) => [mapping.providerItemId as string, mapping]),
  );

  const orderId = `order_${input.externalId}`;
  const timestamp = input.createdAt;
  const order: OrderRecord = {
    id: orderId,
    externalId: input.externalId,
    reference: input.reference,
    customerName: input.customerName ?? null,
    localCanceledAt: null,
    localCanceledByAreaId: null,
    localCanceledByRole: null,
    localCancellationReason: null,
    waiterName: input.waiterName ?? null,
    source: input.channel,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const items = input.items.map<OrderItemRecord>((item) => {
    const mapping =
      (item.providerExternalId
        ? mappingsByProviderExternalId.get(item.providerExternalId)
        : undefined) ??
      (item.providerItemId
        ? mappingsByProviderItemId.get(item.providerItemId)
        : undefined) ??
      mappingsByProviderExternalId.get(item.menuItemId) ??
      mappingsByProviderItemId.get(item.menuItemId) ??
      mappingsByLocalMenuItemId.get(item.menuItemId);

    if (!mapping) {
      throw new MissingKitchenMappingError(
        item.providerExternalId ?? item.providerItemId ?? item.menuItemId,
        item.name,
      );
    }

    return {
      id: `${orderId}__${item.externalItemId}`,
      orderId,
      externalItemId: item.externalItemId,
      menuItemId: mapping.menuItemId,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes ?? null,
      kitchenId: mapping.kitchenId,
      status: "new",
      providerAddedAt: null,
      providerRemovedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });

  const kitchenIds = [...new Set(items.map((item) => item.kitchenId))];
  const tickets = kitchenIds.map<KitchenTicketRecord>((kitchenId) => ({
    id: `${orderId}__${kitchenId}`,
    orderId,
    kitchenId,
    startedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  return {
    order,
    items,
    tickets,
  };
}
