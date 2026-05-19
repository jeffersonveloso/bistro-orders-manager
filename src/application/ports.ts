import type { AccessRole, AreaId } from "@/src/domain/area-access";
import type {
  ItemStatus,
  Kitchen,
  KitchenId,
  MenuItemKitchenMapping,
  OrderAggregate,
  RawProviderOrderInput,
} from "@/src/domain/production";
import type {
  AcknowledgeExceptionInput,
  ApplyChangedExceptionInput,
  AcknowledgeSyncExceptionInput,
  FinishSyncRunInput,
  InboundProviderEvent,
  ListConfirmedOrdersInput,
  ListCatalogItemsInput,
  OpenSyncExceptionInput,
  ProviderCatalogItem,
  ProviderEventRecord,
  ProviderOrderReference,
  ProviderOrderSnapshot,
  ProviderOrderState,
  ReconcileInput,
  ResolveSyncExceptionInput,
  StartSyncRunInput,
  SyncExceptionRecord,
  SyncRunRecord,
  SyncRunResult,
  WebhookInput,
  WebhookProcessResult,
  ProviderName,
} from "@/src/domain/provider-sync";
import type { SplitOrderResult } from "@/src/domain/split-order-service";

export interface OrderProviderPort {
  listOrders(): RawProviderOrderInput[];
}

export interface ProviderSyncService {
  handleWebhook(input: WebhookInput): Promise<WebhookProcessResult>;
  reconcileConfirmedOrders(input: ReconcileInput): Promise<SyncRunResult>;
  acknowledgeException(input: AcknowledgeExceptionInput): Promise<void>;
  applyChangedException(input: ApplyChangedExceptionInput): Promise<void>;
}

export interface OrderSyncProviderPort {
  providerName(): ProviderOrderReference["provider"];
  fetchOrderById(
    externalOrderId: string,
  ): Promise<ProviderOrderSnapshot | null>;
  listConfirmedOrders(
    input: ListConfirmedOrdersInput,
  ): Promise<ProviderOrderSnapshot[]>;
  toProductionInput(
    snapshot: ProviderOrderSnapshot,
  ): RawProviderOrderInput | null;
}

export interface CatalogExternalIdSupport {
  provider: ProviderName;
  providerLabel: string;
  mode: "manual_assist" | "api_write";
  actionLabel: string;
  summary: string;
  helpUrl?: string | null;
  instructions: string[];
}

export interface PublishCatalogExternalIdInput {
  providerItemId: string;
  externalId: string;
}

export interface PublishCatalogExternalIdResult {
  status: "published" | "skipped";
  providerMessage?: string | null;
}

export interface CatalogAdminProviderPort {
  providerName(): ProviderName;
  getCatalogExternalIdSupport(): CatalogExternalIdSupport;
  listCatalogItems(
    input: ListCatalogItemsInput,
  ): Promise<ProviderCatalogItem[]>;
  publishExternalId(
    input: PublishCatalogExternalIdInput,
  ): Promise<PublishCatalogExternalIdResult>;
}

export interface ProductionRepository {
  listKitchens(): Kitchen[];
  listKitchenMappings(): MenuItemKitchenMapping[];
  listImportedExternalOrderIds(): string[];
  saveImportedOrder(order: SplitOrderResult): void;
  replaceImportedOrder(order: SplitOrderResult): void;
  listOrderAggregates(): OrderAggregate[];
  getOrderAggregate(orderId: string): OrderAggregate | undefined;
  updateItemStatus(
    orderId: string,
    itemId: string,
    status: ItemStatus,
  ): OrderAggregate;
  cancelOrderLocally(
    orderId: string,
    input: {
      canceledByAreaId: AreaId;
      canceledByRole: Extract<AccessRole, "manager" | "admin">;
      reason: string;
    },
  ): OrderAggregate;
  startKitchenTicket(orderId: string, kitchenId: KitchenId): OrderAggregate;
  completeKitchenTicket(orderId: string, kitchenId: KitchenId): OrderAggregate;
}

export interface ProviderSyncRepository {
  recordInboundEvent(event: InboundProviderEvent): ProviderEventRecord;
  getInboundEventByDeliveryKey(input: {
    provider: InboundProviderEvent["provider"];
    deliveryKey: string;
  }): ProviderEventRecord | undefined;
  startSyncRun(input: StartSyncRunInput): SyncRunRecord;
  finishSyncRun(input: FinishSyncRunInput): void;
  getProviderOrder(
    input: ProviderOrderReference,
  ): ProviderOrderState | undefined;
  upsertProviderOrder(state: ProviderOrderState): void;
  openOrRefreshException(
    input: OpenSyncExceptionInput,
  ): SyncExceptionRecord;
  acknowledgeException(input: AcknowledgeSyncExceptionInput): void;
  resolveException(input: ResolveSyncExceptionInput): void;
  listUnresolvedSyncExceptions(): SyncExceptionRecord[];
  listUnresolvedSyncExceptionsByOrderIds(
    orderIds: string[],
  ): SyncExceptionRecord[];
  getUnresolvedSyncExceptionForOrder(
    orderId: string,
  ): SyncExceptionRecord | undefined;
  listSyncExceptionsForOrder(orderId: string): SyncExceptionRecord[];
  runInTransaction<T>(work: () => T): T;
}
