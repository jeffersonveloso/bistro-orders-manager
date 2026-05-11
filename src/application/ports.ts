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
  AcknowledgeSyncExceptionInput,
  FinishSyncRunInput,
  InboundProviderEvent,
  ListConfirmedOrdersInput,
  OpenSyncExceptionInput,
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
} from "@/src/domain/provider-sync";
import type { SplitOrderResult } from "@/src/domain/split-order-service";

export interface OrderProviderPort {
  listOrders(): RawProviderOrderInput[];
}

export interface ProviderSyncService {
  handleWebhook(input: WebhookInput): Promise<WebhookProcessResult>;
  reconcileConfirmedOrders(input: ReconcileInput): Promise<SyncRunResult>;
  acknowledgeException(input: AcknowledgeExceptionInput): Promise<void>;
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

export interface ProductionRepository {
  listKitchens(): Kitchen[];
  listKitchenMappings(): MenuItemKitchenMapping[];
  listImportedExternalOrderIds(): string[];
  saveImportedOrder(order: SplitOrderResult): void;
  listOrderAggregates(): OrderAggregate[];
  getOrderAggregate(orderId: string): OrderAggregate | undefined;
  updateItemStatus(
    orderId: string,
    itemId: string,
    status: ItemStatus,
  ): OrderAggregate;
  startKitchenTicket(orderId: string, kitchenId: KitchenId): OrderAggregate;
  completeKitchenTicket(orderId: string, kitchenId: KitchenId): OrderAggregate;
}

export interface ProviderSyncRepository {
  recordInboundEvent(event: InboundProviderEvent): ProviderEventRecord;
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
