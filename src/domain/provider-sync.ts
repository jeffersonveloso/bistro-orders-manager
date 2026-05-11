export const providerNames = ["anota_ai"] as const;
export type ProviderName = (typeof providerNames)[number];

export const syncTriggers = ["webhook", "reconciliation", "replay"] as const;
export type SyncTrigger = (typeof syncTriggers)[number];

export const syncRunStatuses = ["running", "completed", "failed"] as const;
export type SyncRunStatus = (typeof syncRunStatuses)[number];

export const providerEventProcessStatuses = [
  "received",
  "processed",
  "failed",
] as const;
export type ProviderEventProcessStatus =
  (typeof providerEventProcessStatuses)[number];

export const syncExceptionKinds = [
  "missing_mapping",
  "changed_externally",
  "canceled_externally",
  "ingestion_failed",
] as const;
export type SyncExceptionKind = (typeof syncExceptionKinds)[number];

export const syncExceptionStatuses = [
  "open",
  "acknowledged",
  "resolved",
] as const;
export type SyncExceptionStatus = (typeof syncExceptionStatuses)[number];

export const providerOrderLifecycles = [
  "pending_confirmation",
  "confirmed_ready",
  "canceled",
] as const;
export type ProviderOrderLifecycle = (typeof providerOrderLifecycles)[number];

export const webhookProcessOutcomes = [
  "imported",
  "duplicate_ignored",
  "exception_opened",
  "exception_refreshed",
] as const;
export type WebhookProcessOutcome = (typeof webhookProcessOutcomes)[number];

export interface ProviderOrderReference {
  provider: ProviderName;
  externalOrderId: string;
}

export interface ProviderOrderSnapshotItemModifier {
  name: string;
  quantity?: number;
  notes?: string;
}

export interface ProviderOrderSnapshotItem {
  externalItemId: string;
  catalogExternalId: string | null;
  name: string;
  quantity: number;
  notes?: string;
  modifiers: ProviderOrderSnapshotItemModifier[];
}

export interface ProviderOrderSnapshot extends ProviderOrderReference {
  reference: string;
  customerName?: string;
  channel: string;
  providerStatus: string;
  lifecycle: ProviderOrderLifecycle;
  providerUpdatedAt: string;
  items: ProviderOrderSnapshotItem[];
  notes?: string;
  rawPayload: unknown;
}

export interface ListConfirmedOrdersInput {
  updatedSince?: string;
  limit?: number;
}

export interface WebhookInput {
  provider: ProviderName;
  deliveryKey: string;
  eventType: string;
  externalOrderId?: string;
  payload: unknown;
  receivedAt?: string;
}

export interface WebhookProcessResult {
  runId: string;
  eventId: string;
  outcome: WebhookProcessOutcome;
  externalOrderId: string | null;
  orderId: string | null;
  exceptionId: string | null;
  exceptionKind: SyncExceptionKind | null;
}

export interface ReconcileInput extends ListConfirmedOrdersInput {
  provider: ProviderName;
  externalOrderId?: string;
}

export interface SyncRunResult {
  runId: string;
  processed: number;
  imported: number;
  ignored: number;
  openedExceptions: number;
  resolvedExceptions: number;
}

export interface AcknowledgeExceptionInput {
  orderId: string;
  exceptionId: string;
  acknowledgedVia: string;
  resolutionNote?: string;
  acknowledgedAt?: string;
}

export interface InboundProviderEvent {
  provider: ProviderName;
  deliveryKey: string;
  eventType: string;
  externalOrderId?: string | null;
  payload: unknown;
  receivedAt: string;
}

export interface ProviderEventRecord {
  id: string;
  provider: ProviderName;
  deliveryKey: string;
  eventType: string;
  externalOrderId: string | null;
  payload: unknown;
  receivedAt: string;
  processedAt: string | null;
  processStatus: ProviderEventProcessStatus;
  syncRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface StartSyncRunInput {
  provider: ProviderName;
  trigger: SyncTrigger;
  candidateCount?: number;
  startedAt?: string;
  sourceEventId?: string | null;
}

export interface SyncRunRecord {
  id: string;
  provider: ProviderName;
  trigger: SyncTrigger;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  candidateCount: number;
  importedCount: number;
  ignoredCount: number;
  exceptionCount: number;
  errorCount: number;
}

export interface FinishSyncRunInput {
  syncRunId: string;
  status: Extract<SyncRunStatus, "completed" | "failed">;
  finishedAt?: string;
  candidateCount?: number;
  importedCount?: number;
  ignoredCount?: number;
  exceptionCount?: number;
  errorCount?: number;
  event?: {
    eventId: string;
    processStatus: Extract<ProviderEventProcessStatus, "processed" | "failed">;
    processedAt?: string;
    errorCode?: string | null;
    errorMessage?: string | null;
  };
}

export interface ProviderOrderState extends ProviderOrderReference {
  providerStatus: string;
  lifecycle: ProviderOrderLifecycle;
  snapshotHash: string;
  snapshot: ProviderOrderSnapshot;
  lastSeenAt: string;
  lastAppliedAt: string | null;
  importedOrderId: string | null;
}

export interface SyncExceptionRecord {
  id: string;
  provider: ProviderName;
  externalOrderId: string | null;
  orderId: string | null;
  sourceEventId: string | null;
  kind: SyncExceptionKind;
  status: SyncExceptionStatus;
  summary: string;
  details: unknown;
  detectedAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedVia: string | null;
  resolvedAt: string | null;
  resolvedVia: string | null;
  resolutionNote: string | null;
}

export interface OpenSyncExceptionInput {
  provider: ProviderName;
  kind: SyncExceptionKind;
  externalOrderId?: string | null;
  orderId?: string | null;
  sourceEventId?: string | null;
  summary: string;
  details?: unknown;
  detectedAt?: string;
  lastSeenAt?: string;
}

export type AcknowledgeSyncExceptionInput = AcknowledgeExceptionInput;

export interface ResolveSyncExceptionInput {
  provider: ProviderName;
  kind: SyncExceptionKind;
  externalOrderId?: string | null;
  orderId?: string | null;
  resolvedVia: string;
  resolutionNote?: string;
  resolvedAt?: string;
}

export function isProviderName(
  value: string | null | undefined,
): value is ProviderName {
  return parseProviderName(value) !== undefined;
}

export function parseProviderName(
  value: string | null | undefined,
): ProviderName | undefined {
  return parseLiteralValue(providerNames, value);
}

export function parseSyncTrigger(
  value: string | null | undefined,
): SyncTrigger | undefined {
  return parseLiteralValue(syncTriggers, value);
}

export function parseProviderOrderLifecycle(
  value: string | null | undefined,
): ProviderOrderLifecycle | undefined {
  return parseLiteralValue(providerOrderLifecycles, value);
}

export function createProviderOrderReference(input: {
  provider: string | null | undefined;
  externalOrderId: string | null | undefined;
}): ProviderOrderReference {
  const provider = parseProviderName(input.provider);

  if (!provider) {
    throw new TypeError(
      "provider must be a supported provider identifier for provider-scoped sync records",
    );
  }

  return {
    provider,
    externalOrderId: requireNonBlankString(
      input.externalOrderId,
      "externalOrderId",
    ),
  };
}

function parseLiteralValue<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
): T | undefined {
  if (!hasNonBlankString(value)) {
    return undefined;
  }

  const normalizedValue = value.trim();

  return (values as readonly string[]).includes(normalizedValue)
    ? (normalizedValue as T)
    : undefined;
}

function hasNonBlankString(
  value: string | null | undefined,
): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function requireNonBlankString(
  value: string | null | undefined,
  fieldName: string,
) {
  if (!hasNonBlankString(value)) {
    throw new TypeError(`${fieldName} is required`);
  }

  return value.trim();
}
