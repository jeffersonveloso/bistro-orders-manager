import type {
  ProductionRepository,
  ProviderSyncRepository,
} from "@/src/application/ports";
import {
  deriveOrderStatus,
  deriveTicketStatus,
  type ItemStatus,
  type OrderAggregate,
  type OrderStatus,
  isKitchenId,
  type KitchenId,
  ORDER_STATUS_LABELS,
  type TicketStatus,
  TICKET_STATUS_LABELS,
} from "@/src/domain/production";
import type {
  SyncExceptionKind,
  SyncExceptionRecord,
  SyncExceptionStatus,
} from "@/src/domain/provider-sync";

type ProductionReadRepository = ProductionRepository &
  Pick<
    ProviderSyncRepository,
    | "getProviderOrder"
    | "getUnresolvedSyncExceptionForOrder"
    | "listSyncExceptionsForOrder"
    | "listUnresolvedSyncExceptions"
    | "listUnresolvedSyncExceptionsByOrderIds"
  >;

export interface SyncExceptionPresentation {
  id: string;
  kind: SyncExceptionKind;
  status: SyncExceptionStatus;
  label: string;
  statusLabel: string;
  summary: string;
  detail: string | null;
  orderId: string | null;
  externalOrderId: string | null;
  detectedAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedVia: string | null;
  resolvedAt: string | null;
  resolvedVia: string | null;
  resolutionNote: string | null;
}

export interface SyncTrailEntry {
  id: string;
  exceptionId: string;
  event: "detected" | "acknowledged" | "resolved";
  label: string;
  summary: string;
  detail: string | null;
  occurredAt: string;
  actor: string | null;
}

export interface SyncAlert {
  id: string;
  label: string;
  statusLabel: string;
  summary: string;
  detail: string | null;
  status: SyncExceptionStatus;
  orderId: string | null;
  externalOrderId: string | null;
  reference: string;
  customerName: string | null;
  focusKitchenId: KitchenId | null;
  detectedAt: string;
  lastSeenAt: string;
}

export interface ExternalItemStatusPresentation {
  kind: "canceled" | "changed";
  label: string;
  detail: string | null;
}

export interface OrderItemPresentation {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  status: ItemStatus;
  externalStatus: ExternalItemStatusPresentation | null;
}

const SYNC_EXCEPTION_LABELS: Record<SyncExceptionKind, string> = {
  missing_mapping: "Item sem mapeamento",
  changed_externally: "Mudança externa",
  canceled_externally: "Cancelado no provedor",
  ingestion_failed: "Falha de sincronização",
};

const SYNC_EXCEPTION_STATUS_LABELS: Record<SyncExceptionStatus, string> = {
  open: "Ação pendente",
  acknowledged: "Salão ciente",
  resolved: "Resolvida",
};

const SYNC_DIFF_LABELS: Record<string, string> = {
  item_added: "item incluído",
  item_removed: "item removido",
  menu_item_changed: "item trocado",
  name_changed: "nome alterado",
  quantity_changed: "quantidade alterada",
  item_notes_changed: "observação do item alterada",
  order_notes_changed: "observação do pedido alterada",
  modifiers_changed: "modificadores alterados",
};

export interface BoardTicketCard {
  orderId: string;
  ticketId: string;
  kitchenId: KitchenId;
  kitchenName: string;
  reference: string;
  customerName: string | null;
  ticketStatus: keyof typeof TICKET_STATUS_LABELS;
  ticketStatusLabel: string;
  orderStatus: keyof typeof ORDER_STATUS_LABELS;
  orderStatusLabel: string;
  ageLabel: string;
  currentItems: OrderItemPresentation[];
  otherKitchenStatus: string | null;
  otherKitchenName: string | null;
  hasOpenSyncException: boolean;
  syncExceptionLabel: string | null;
  syncExceptionStatusLabel: string | null;
}

export interface BoardKitchenColumn {
  status: "new" | "in_preparation" | "ready" | "canceled";
  label: string;
  tickets: BoardTicketCard[];
}

export interface BoardKitchenData {
  id: KitchenId;
  name: string;
  description: string;
  columns: BoardKitchenColumn[];
}

export interface SalonSummaryOrder {
  orderId: string;
  reference: string;
  customerName: string | null;
  orderStatus: string;
  hasOpenSyncException: boolean;
  syncExceptionLabel: string | null;
  syncException: SyncExceptionPresentation | null;
  ticketBreakdown: Array<{
    kitchenName: string;
    statusLabel: string;
  }>;
}

export interface DashboardMetrics {
  activeOrders: number;
  partiallyReadyOrders: number;
  readyToServeOrders: number;
}

export interface DashboardData {
  kitchens: BoardKitchenData[];
  openSyncExceptions: number;
  syncAlerts: SyncAlert[];
  salonSummary: SalonSummaryOrder[];
  metrics: DashboardMetrics;
  generatedAt: string;
}

export interface SalonData {
  summary: SalonSummaryOrder[];
  metrics: DashboardMetrics;
  openSyncExceptions: number;
  generatedAt: string;
}

export interface OrderDetailData {
  orderId: string;
  reference: string;
  customerName: string | null;
  focusKitchenId: KitchenId;
  focusKitchenName: string;
  focusTicketStatus: TicketStatus;
  focusKitchenStatus: string;
  orderStatusKey: OrderStatus;
  orderStatus: string;
  focusItems: OrderItemPresentation[];
  otherKitchen: {
    id: KitchenId;
    name: string;
    statusKey: TicketStatus;
    status: string;
    items: OrderItemPresentation[];
  } | null;
  syncException: SyncExceptionPresentation | null;
  syncTrail: SyncTrailEntry[];
}

function formatAgeLabel(createdAt: string) {
  const diffInMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(createdAt).getTime()) / 60_000),
  );

  if (diffInMinutes < 1) {
    return "agora";
  }

  return `${diffInMinutes} min`;
}

function hasSyncReadSupport(
  repository: ProductionRepository,
): repository is ProductionReadRepository {
  return (
    "getProviderOrder" in repository &&
    "listUnresolvedSyncExceptions" in repository &&
    "listUnresolvedSyncExceptionsByOrderIds" in repository &&
    "getUnresolvedSyncExceptionForOrder" in repository &&
    "listSyncExceptionsForOrder" in repository
  );
}

interface ProductionReadContext {
  repository: ProductionRepository;
  kitchens: ReturnType<ProductionRepository["listKitchens"]>;
  aggregates: OrderAggregate[];
  syncRepository: ProductionReadRepository | null;
  unresolvedExceptions: SyncExceptionRecord[];
  aggregateByOrderId: Map<string, OrderAggregate>;
  latestExceptionByOrderId: Map<string, SyncExceptionRecord>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSyncSummary(value: string) {
  return value.replace(/^Pedido\s+Pedido\s+/i, "Pedido ");
}

function describeChangedDiffs(details: unknown) {
  const record = asRecord(details);
  const diffValues = Array.isArray(record?.diffs) ? record.diffs : [];
  const labels = diffValues
    .map((diff) => asRecord(diff))
    .map((diff) => (diff ? asString(diff.type) : null))
    .filter((type): type is string => type !== null)
    .map((type) => SYNC_DIFF_LABELS[type] ?? type)
    .filter((label, index, values) => values.indexOf(label) === index);

  if (labels.length === 0) {
    return null;
  }

  if (labels.length === 1) {
    return `Alteração detectada: ${labels[0]}.`;
  }

  const preview = labels.slice(0, 3).join(", ");

  return `Alterações detectadas: ${preview}${
    labels.length > 3 ? ` e mais ${labels.length - 3}` : ""
  }.`;
}

function describeSyncExceptionDetail(exception: SyncExceptionRecord) {
  const details = asRecord(exception.details);

  switch (exception.kind) {
    case "missing_mapping": {
      const menuItemName = asString(details?.menuItemName);
      const menuItemId = asString(details?.menuItemId);

      if (menuItemName || menuItemId) {
        return `Item sem cozinha mapeada: ${menuItemName ?? menuItemId}.`;
      }

      return "O pedido ficou fora da produção por falta de roteamento local.";
    }
    case "changed_externally":
      return (
        describeChangedDiffs(exception.details) ??
        "O provedor informou uma mudança operacional após a importação."
      );
    case "canceled_externally": {
      const providerStatus = asString(details?.providerStatus);
      const lifecycle = asString(details?.lifecycle);

      if (providerStatus || lifecycle) {
        return `Estado atual no provedor: ${
          providerStatus ?? lifecycle
        }.`;
      }

      return "O pedido saiu do estado válido para produção no provedor.";
    }
    case "ingestion_failed": {
      const stage = asString(details?.stage);

      if (stage) {
        return `Falha técnica durante a etapa de ${stage}.`;
      }

      return "A sincronização técnica falhou antes de consolidar o pedido.";
    }
    default:
      return null;
  }
}

function humanizeExceptionActor(value: string | null) {
  switch (value) {
    case "salon_ui":
      return "Salão";
    case "sync_apply_success":
      return "Replay aplicado";
    case "snapshot_reconciled":
      return "Reconciliação";
    case "snapshot_confirmed_ready":
      return "Confirmação restaurada";
    case "snapshot_superseded":
      return "Estado substituído";
    default:
      return value;
  }
}

function toSyncExceptionPresentation(
  exception: SyncExceptionRecord,
): SyncExceptionPresentation {
  return {
    id: exception.id,
    kind: exception.kind,
    status: exception.status,
    label: SYNC_EXCEPTION_LABELS[exception.kind],
    statusLabel: SYNC_EXCEPTION_STATUS_LABELS[exception.status],
    summary: normalizeSyncSummary(exception.summary),
    detail: describeSyncExceptionDetail(exception),
    orderId: exception.orderId,
    externalOrderId: exception.externalOrderId,
    detectedAt: exception.detectedAt,
    lastSeenAt: exception.lastSeenAt,
    acknowledgedAt: exception.acknowledgedAt,
    acknowledgedVia: exception.acknowledgedVia,
    resolvedAt: exception.resolvedAt,
    resolvedVia: exception.resolvedVia,
    resolutionNote: exception.resolutionNote,
  };
}

function buildSyncTrail(exceptions: SyncExceptionRecord[]) {
  return exceptions
    .flatMap<SyncTrailEntry>((exception) => {
      const presentation = toSyncExceptionPresentation(exception);
      const entries: SyncTrailEntry[] = [
        {
          id: `${exception.id}:detected`,
          exceptionId: exception.id,
          event: "detected",
          label: presentation.label,
          summary: presentation.summary,
          detail: presentation.detail,
          occurredAt: exception.detectedAt,
          actor: "Integração externa",
        },
      ];

      if (exception.acknowledgedAt) {
        entries.push({
          id: `${exception.id}:acknowledged`,
          exceptionId: exception.id,
          event: "acknowledged",
          label: "Salão ciente",
          summary:
            exception.resolutionNote ??
            "A exceção segue visível até replay ou reconciliação.",
          detail: null,
          occurredAt: exception.acknowledgedAt,
          actor: humanizeExceptionActor(exception.acknowledgedVia),
        });
      }

      if (exception.resolvedAt) {
        entries.push({
          id: `${exception.id}:resolved`,
          exceptionId: exception.id,
          event: "resolved",
          label: "Exceção resolvida",
          summary:
            exception.resolutionNote ??
            "A divergência deixou de exigir atenção operacional.",
          detail: null,
          occurredAt: exception.resolvedAt,
          actor: humanizeExceptionActor(exception.resolvedVia),
        });
      }

      return entries;
    })
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function buildItemExternalStatuses(
  exception: SyncExceptionRecord | undefined,
  aggregate: OrderAggregate,
) {
  const statuses = new Map<string, ExternalItemStatusPresentation>();

  if (!exception) {
    return statuses;
  }

  if (exception.kind === "canceled_externally") {
    for (const item of aggregate.items) {
      statuses.set(item.id, {
        kind: "canceled",
        label: "Cancelado",
        detail: "Pedido cancelado no provedor.",
      });
    }

    return statuses;
  }

  if (exception.kind !== "changed_externally") {
    return statuses;
  }

  const details = asRecord(exception.details);
  const diffs = Array.isArray(details?.diffs) ? details.diffs : [];

  for (const rawDiff of diffs) {
    const diff = asRecord(rawDiff);

    if (!diff) {
      continue;
    }

    const type = asString(diff?.type);
    const matchingItems = resolveAggregateItemsForDiff(aggregate, diff);

    if (!type || matchingItems.length === 0) {
      continue;
    }

    const nextStatus = toExternalItemStatusPresentation(type, diff);

    if (!nextStatus) {
      continue;
    }

    for (const item of matchingItems) {
      const existingStatus = statuses.get(item.id);

      if (existingStatus?.kind === "canceled" && nextStatus.kind !== "canceled") {
        continue;
      }

      statuses.set(item.id, nextStatus);
    }
  }

  return statuses;
}

function resolveAggregateItemsForDiff(
  aggregate: OrderAggregate,
  diff: Record<string, unknown>,
) {
  const externalItemId = asString(diff.externalItemId);

  if (externalItemId) {
    const exactExternalIdMatches = aggregate.items.filter(
      (item) => item.externalItemId === externalItemId,
    );

    if (exactExternalIdMatches.length === 1) {
      return exactExternalIdMatches;
    }
  }

  const before = asRecord(diff.before);
  const after = asRecord(diff.after);
  const menuItemId =
    asString(before?.menuItemId) ??
    asString(after?.menuItemId);
  const itemName =
    asString(before?.name) ??
    asString(after?.name);
  const itemNotes =
    asString(before?.notes) ??
    asString(after?.notes);

  if (!menuItemId && !itemName) {
    return [];
  }

  let matches = aggregate.items;

  if (menuItemId) {
    matches = matches.filter((item) => item.menuItemId === menuItemId);
  }

  if (itemName) {
    matches = matches.filter((item) => item.name === itemName);
  }

  if (itemNotes) {
    matches = matches.filter((item) => item.notes === itemNotes);
  }

  return matches;
}

function toExternalItemStatusPresentation(
  type: string,
  diff: Record<string, unknown>,
): ExternalItemStatusPresentation | null {
  switch (type) {
    case "item_removed":
      return {
        kind: "canceled",
        label: "Cancelado",
        detail: "Item removido do pedido no provedor.",
      };
    case "quantity_changed": {
      const before = asNumber(diff.before);
      const after = asNumber(diff.after);

      if (
        before !== null &&
        after !== null &&
        after >= 0 &&
        after < before
      ) {
        return {
          kind: "changed",
          label: `Qtd. agora ${after}`,
          detail: "Quantidade reduzida no provedor.",
        };
      }

      return {
        kind: "changed",
        label: "Quantidade alterada",
        detail: "Quantidade alterada no provedor após a importação.",
      };
    }
    case "menu_item_changed":
      return {
        kind: "changed",
        label: "Item alterado",
        detail: "O item foi trocado no provedor após a importação.",
      };
    case "name_changed":
      return {
        kind: "changed",
        label: "Nome alterado",
        detail: "O nome do item mudou no provedor após a importação.",
      };
    case "item_notes_changed":
      return {
        kind: "changed",
        label: "Observação alterada",
        detail: "A observação do item foi alterada no provedor.",
      };
    case "modifiers_changed":
      return {
        kind: "changed",
        label: "Modificador alterado",
        detail: "Os modificadores do item foram alterados no provedor.",
      };
    default:
      return null;
  }
}

function isCanceledExternalStatus(
  status: ExternalItemStatusPresentation | null | undefined,
) {
  return status?.kind === "canceled";
}

function deriveOperationalTicketStatus(
  items: OrderAggregate["items"],
  itemStatuses: Map<string, ExternalItemStatusPresentation>,
  exception?: SyncExceptionRecord,
): TicketStatus {
  if (exception?.kind === "canceled_externally") {
    return "canceled";
  }

  const activeItems = items.filter(
    (item) => !isCanceledExternalStatus(itemStatuses.get(item.id)),
  );

  if (activeItems.length === 0) {
    return deriveTicketStatus(items);
  }

  return deriveTicketStatus(activeItems);
}

function projectProviderStatusToTicketStatus(
  localStatus: TicketStatus,
  providerStatus: string | null | undefined,
) {
  if (localStatus === "canceled" || localStatus !== "new") {
    return localStatus;
  }

  if (providerStatus === "in_production") {
    return "in_preparation" as const;
  }

  if (providerStatus === "ready" || providerStatus === "finalized") {
    return "ready" as const;
  }

  return localStatus;
}

function buildOperationalTicketStatuses(
  aggregate: OrderAggregate,
  itemStatuses: Map<string, ExternalItemStatusPresentation>,
  exception?: SyncExceptionRecord,
  providerStatus?: string | null,
) {
  return new Map(
    aggregate.tickets.map((ticket) => [
      ticket.kitchenId,
      projectProviderStatusToTicketStatus(
        deriveOperationalTicketStatus(
          aggregate.items.filter((item) => item.kitchenId === ticket.kitchenId),
          itemStatuses,
          exception,
        ),
        providerStatus,
      ),
    ]),
  );
}

function toOrderItemPresentation(
  items: OrderAggregate["items"],
  itemStatuses: Map<string, ExternalItemStatusPresentation>,
): OrderItemPresentation[] {
  return [...items]
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status,
      externalStatus: itemStatuses.get(item.id) ?? null,
    }))
    .sort((left, right) => {
      const leftPriority = left.externalStatus?.kind === "canceled" ? 1 : 0;
      const rightPriority = right.externalStatus?.kind === "canceled" ? 1 : 0;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
      });
    });
}

function buildProductionReadContext(
  repository: ProductionRepository,
): ProductionReadContext {
  const kitchens = repository.listKitchens();
  const aggregates = repository.listOrderAggregates();
  const syncRepository = hasSyncReadSupport(repository) ? repository : null;
  const orderIds = aggregates.map((aggregate) => aggregate.order.id);
  const unresolvedExceptions = syncRepository
    ? syncRepository.listUnresolvedSyncExceptions()
    : [];
  const orderExceptions = syncRepository
    ? syncRepository.listUnresolvedSyncExceptionsByOrderIds(orderIds)
    : [];
  const aggregateByOrderId = new Map(
    aggregates.map((aggregate) => [aggregate.order.id, aggregate] as const),
  );
  const latestExceptionByOrderId = new Map<string, SyncExceptionRecord>();

  for (const exception of orderExceptions) {
    if (!exception.orderId || latestExceptionByOrderId.has(exception.orderId)) {
      continue;
    }

    latestExceptionByOrderId.set(exception.orderId, exception);
  }

  return {
    repository,
    kitchens,
    aggregates,
    syncRepository,
    unresolvedExceptions,
    aggregateByOrderId,
    latestExceptionByOrderId,
  };
}

function buildSalonSummary(
  context: ProductionReadContext,
): SalonSummaryOrder[] {
  return context.aggregates
    .map((aggregate) => {
      const syncException = context.latestExceptionByOrderId.get(aggregate.order.id);
      const providerState = context.syncRepository
        ? context.syncRepository.getProviderOrder({
            provider: "anota_ai",
            externalOrderId: aggregate.order.externalId,
          })
        : undefined;
      const itemStatuses = buildItemExternalStatuses(syncException, aggregate);
      const ticketStatusesByKitchenId = buildOperationalTicketStatuses(
        aggregate,
        itemStatuses,
        syncException,
        providerState?.providerStatus,
      );

      const ticketBreakdown = aggregate.tickets.map((ticket) => {
        const kitchen = context.kitchens.find(
          (candidate) => candidate.id === ticket.kitchenId,
        );
        const status =
          ticketStatusesByKitchenId.get(ticket.kitchenId) ??
          projectProviderStatusToTicketStatus(
            deriveOperationalTicketStatus(
              aggregate.items.filter((item) => item.kitchenId === ticket.kitchenId),
              itemStatuses,
              syncException,
            ),
            providerState?.providerStatus,
          );

        return {
          kitchenName: kitchen?.name ?? ticket.kitchenId,
          statusLabel: TICKET_STATUS_LABELS[status],
        };
      });

      const orderStatus = deriveOrderStatus(
        aggregate.tickets.map((ticket) => ({
          ...ticket,
          status:
            ticketStatusesByKitchenId.get(ticket.kitchenId) ??
            projectProviderStatusToTicketStatus(
              deriveOperationalTicketStatus(
                aggregate.items.filter((item) => item.kitchenId === ticket.kitchenId),
                itemStatuses,
                syncException,
              ),
              providerState?.providerStatus,
            ),
        })),
      );

      return {
        orderId: aggregate.order.id,
        reference: aggregate.order.reference,
        customerName: aggregate.order.customerName,
        orderStatus: ORDER_STATUS_LABELS[orderStatus],
        hasOpenSyncException: Boolean(syncException),
        syncExceptionLabel: syncException
          ? SYNC_EXCEPTION_LABELS[syncException.kind]
          : null,
        syncException: syncException
          ? toSyncExceptionPresentation(syncException)
          : null,
        ticketBreakdown,
      };
    })
    .sort((left, right) =>
      left.reference.localeCompare(right.reference, undefined, { numeric: true }),
    );
}

function buildDashboardMetrics(
  salonSummary: SalonSummaryOrder[],
): DashboardMetrics {
  return {
    activeOrders: salonSummary.filter(
      (order) => order.orderStatus !== ORDER_STATUS_LABELS.canceled,
    ).length,
    partiallyReadyOrders: salonSummary.filter(
      (order) => order.orderStatus === ORDER_STATUS_LABELS.partially_ready,
    ).length,
    readyToServeOrders: salonSummary.filter(
      (order) => order.orderStatus === ORDER_STATUS_LABELS.ready_to_serve,
    ).length,
  };
}

function buildSyncAlerts(context: ProductionReadContext): SyncAlert[] {
  return context.unresolvedExceptions.map<SyncAlert>((exception) => {
    const presentation = toSyncExceptionPresentation(exception);
    const aggregate = exception.orderId
      ? context.aggregateByOrderId.get(exception.orderId)
      : undefined;

    return {
      id: exception.id,
      label: presentation.label,
      statusLabel: presentation.statusLabel,
      summary: presentation.summary,
      detail: presentation.detail,
      status: presentation.status,
      orderId: exception.orderId,
      externalOrderId: exception.externalOrderId,
      reference:
        aggregate?.order.reference ??
        (exception.externalOrderId
          ? `Pedido externo ${exception.externalOrderId}`
          : "Pedido externo sem vínculo"),
      customerName: aggregate?.order.customerName ?? null,
      focusKitchenId: aggregate?.tickets[0]?.kitchenId ?? null,
      detectedAt: exception.detectedAt,
      lastSeenAt: exception.lastSeenAt,
    };
  });
}

export function getDashboardData(repository: ProductionRepository): DashboardData {
  const context = buildProductionReadContext(repository);
  const columnStatuses = ["new", "in_preparation", "ready", "canceled"] as const;

  const kitchenBoards = context.kitchens.map((kitchen) => {
    const cards = context.aggregates
      .flatMap((aggregate) => {
        const ticket = aggregate.tickets.find(
          (candidate) => candidate.kitchenId === kitchen.id,
        );

        if (!ticket) {
          return [];
        }

        const ticketItems = aggregate.items.filter(
          (item) => item.kitchenId === kitchen.id,
        );
        const otherTicket = aggregate.tickets.find(
          (candidate) => candidate.kitchenId !== kitchen.id,
        );
        const otherItems = aggregate.items.filter(
          (item) => item.kitchenId !== kitchen.id,
        );

        return [
          (() => {
            const syncException = context.latestExceptionByOrderId.get(
              aggregate.order.id,
            );
            const syncPresentation = syncException
              ? toSyncExceptionPresentation(syncException)
              : null;
            const providerState = context.syncRepository
              ? context.syncRepository.getProviderOrder({
                  provider: "anota_ai",
                  externalOrderId: aggregate.order.externalId,
                })
              : undefined;
            const itemStatuses = buildItemExternalStatuses(
              syncException,
              aggregate,
            );
            const ticketStatusesByKitchenId = buildOperationalTicketStatuses(
              aggregate,
              itemStatuses,
              syncException,
              providerState?.providerStatus,
            );
            const ticketStatus =
              ticketStatusesByKitchenId.get(kitchen.id) ??
              projectProviderStatusToTicketStatus(
                deriveOperationalTicketStatus(
                  ticketItems,
                  itemStatuses,
                  syncException,
                ),
                providerState?.providerStatus,
              );
            const orderStatus = deriveOrderStatus(
              aggregate.tickets.map((candidate) => ({
                ...candidate,
                status:
                  ticketStatusesByKitchenId.get(candidate.kitchenId) ??
                  projectProviderStatusToTicketStatus(
                    deriveOperationalTicketStatus(
                      aggregate.items.filter(
                        (item) => item.kitchenId === candidate.kitchenId,
                      ),
                      itemStatuses,
                      syncException,
                    ),
                    providerState?.providerStatus,
                  ),
              })),
            );

            return {
              orderId: aggregate.order.id,
              ticketId: ticket.id,
              kitchenId: kitchen.id,
              kitchenName: kitchen.name,
              reference: aggregate.order.reference,
              customerName: aggregate.order.customerName,
              ticketStatus,
              ticketStatusLabel: TICKET_STATUS_LABELS[ticketStatus],
              orderStatus,
              orderStatusLabel: ORDER_STATUS_LABELS[orderStatus],
              ageLabel: formatAgeLabel(aggregate.order.createdAt),
              currentItems: toOrderItemPresentation(ticketItems, itemStatuses),
              otherKitchenStatus: otherTicket
                ? TICKET_STATUS_LABELS[
                    ticketStatusesByKitchenId.get(otherTicket.kitchenId) ??
                      projectProviderStatusToTicketStatus(
                        deriveOperationalTicketStatus(
                          otherItems,
                          itemStatuses,
                          syncException,
                        ),
                        providerState?.providerStatus,
                      )
                  ]
                : null,
              otherKitchenName: otherTicket
                ? context.kitchens.find(
                    (candidate) => candidate.id === otherTicket.kitchenId,
                  )?.name ?? null
                : null,
              hasOpenSyncException: Boolean(syncPresentation),
              syncExceptionLabel: syncPresentation?.label ?? null,
              syncExceptionStatusLabel: syncPresentation?.statusLabel ?? null,
            };
          })(),
        ];
      })
      .sort((left, right) =>
        left.reference.localeCompare(right.reference, undefined, {
          numeric: true,
        }),
      );

    return {
      id: kitchen.id,
      name: kitchen.name,
      description: kitchen.description,
      columns: columnStatuses.map((status) => ({
        status,
        label: TICKET_STATUS_LABELS[status],
        tickets: cards.filter((card) => card.ticketStatus === status),
      })),
    };
  });

  const salonSummary = buildSalonSummary(context);

  return {
    kitchens: kitchenBoards,
    openSyncExceptions: context.unresolvedExceptions.length,
    syncAlerts: buildSyncAlerts(context),
    salonSummary,
    metrics: buildDashboardMetrics(salonSummary),
    generatedAt: new Date().toISOString(),
  };
}

export function getSalonData(repository: ProductionRepository): SalonData {
  const context = buildProductionReadContext(repository);
  const summary = buildSalonSummary(context);

  return {
    summary,
    metrics: buildDashboardMetrics(summary),
    openSyncExceptions: context.unresolvedExceptions.length,
    generatedAt: new Date().toISOString(),
  };
}

export function getOrderDetailData(
  repository: ProductionRepository,
  orderId: string,
  requestedKitchenId?: string,
): OrderDetailData | undefined {
  const aggregate = repository.getOrderAggregate(orderId);
  if (!aggregate) {
    return undefined;
  }

  const availableKitchenIds = aggregate.tickets.map((ticket) => ticket.kitchenId);
  const focusKitchenId =
    requestedKitchenId &&
    isKitchenId(requestedKitchenId) &&
    availableKitchenIds.includes(requestedKitchenId)
      ? requestedKitchenId
      : availableKitchenIds[0];

  if (!focusKitchenId) {
    return undefined;
  }

  const kitchens = repository.listKitchens();
  const focusKitchen = kitchens.find((kitchen) => kitchen.id === focusKitchenId);
  const otherKitchen = aggregate.tickets.find(
    (ticket) => ticket.kitchenId !== focusKitchenId,
  );

  const focusItems = aggregate.items.filter(
    (item) => item.kitchenId === focusKitchenId,
  );
  const otherItems = aggregate.items.filter(
    (item) => item.kitchenId !== focusKitchenId,
  );
  const syncRepository = hasSyncReadSupport(repository) ? repository : null;
  const syncException = syncRepository
    ? syncRepository.getUnresolvedSyncExceptionForOrder(orderId)
    : undefined;
  const providerState = syncRepository
    ? syncRepository.getProviderOrder({
        provider: "anota_ai",
        externalOrderId: aggregate.order.externalId,
      })
    : undefined;
  const syncTrail = syncRepository
    ? buildSyncTrail(syncRepository.listSyncExceptionsForOrder(orderId))
    : [];
  const itemStatuses = buildItemExternalStatuses(syncException, aggregate);
  const ticketStatusesByKitchenId = buildOperationalTicketStatuses(
    aggregate,
    itemStatuses,
    syncException,
    providerState?.providerStatus,
  );
  const focusStatus =
    ticketStatusesByKitchenId.get(focusKitchenId) ??
    projectProviderStatusToTicketStatus(
      deriveOperationalTicketStatus(
        focusItems,
        itemStatuses,
        syncException,
      ),
      providerState?.providerStatus,
    );
  const orderStatus = deriveOrderStatus(
    aggregate.tickets.map((ticket) => ({
      ...ticket,
      status:
        ticketStatusesByKitchenId.get(ticket.kitchenId) ??
        projectProviderStatusToTicketStatus(
          deriveOperationalTicketStatus(
            aggregate.items.filter((item) => item.kitchenId === ticket.kitchenId),
            itemStatuses,
            syncException,
          ),
          providerState?.providerStatus,
        ),
    })),
  );

  return {
    orderId: aggregate.order.id,
    reference: aggregate.order.reference,
    customerName: aggregate.order.customerName,
    focusKitchenId,
    focusKitchenName: focusKitchen?.name ?? focusKitchenId,
    focusTicketStatus: focusStatus,
    focusKitchenStatus: TICKET_STATUS_LABELS[focusStatus],
    orderStatusKey: orderStatus,
    orderStatus: ORDER_STATUS_LABELS[orderStatus],
    focusItems: toOrderItemPresentation(focusItems, itemStatuses),
    otherKitchen: otherKitchen
      ? {
          id: otherKitchen.kitchenId,
          name:
            kitchens.find((kitchen) => kitchen.id === otherKitchen.kitchenId)
              ?.name ?? otherKitchen.kitchenId,
          statusKey:
            ticketStatusesByKitchenId.get(otherKitchen.kitchenId) ??
            projectProviderStatusToTicketStatus(
              deriveOperationalTicketStatus(
                otherItems,
                itemStatuses,
                syncException,
              ),
              providerState?.providerStatus,
            ),
          status:
            TICKET_STATUS_LABELS[
              ticketStatusesByKitchenId.get(otherKitchen.kitchenId) ??
                projectProviderStatusToTicketStatus(
                  deriveOperationalTicketStatus(
                    otherItems,
                    itemStatuses,
                    syncException,
                  ),
                  providerState?.providerStatus,
                )
            ],
          items: toOrderItemPresentation(otherItems, itemStatuses),
        }
      : null,
    syncException: syncException
      ? toSyncExceptionPresentation(syncException)
      : null,
    syncTrail,
  };
}

export function setOrderItemStatus(
  repository: ProductionRepository,
  orderId: string,
  itemId: string,
  status: ItemStatus,
) {
  return repository.updateItemStatus(orderId, itemId, status);
}

export function startTicketProduction(
  repository: ProductionRepository,
  orderId: string,
  kitchenId: KitchenId,
) {
  return repository.startKitchenTicket(orderId, kitchenId);
}

export function completeTicketProduction(
  repository: ProductionRepository,
  orderId: string,
  kitchenId: KitchenId,
) {
  return repository.completeKitchenTicket(orderId, kitchenId);
}
