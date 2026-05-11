import crypto from "node:crypto";

import type {
  OrderSyncProviderPort,
  ProductionRepository,
  ProviderSyncRepository,
  ProviderSyncService,
} from "@/src/application/ports";
import type {
  OrderAggregate,
  RawProviderOrderInput,
} from "@/src/domain/production";
import type {
  ProviderName,
  ProviderOrderSnapshot,
  SyncExceptionKind,
  SyncExceptionRecord,
  SyncRunResult,
  WebhookInput,
  WebhookProcessOutcome,
  WebhookProcessResult,
  ReconcileInput,
} from "@/src/domain/provider-sync";
import {
  MissingKitchenMappingError,
  splitProviderOrder,
} from "@/src/domain/split-order-service";

type ProviderSyncRepositoryBundle = ProductionRepository & ProviderSyncRepository;

interface CreateProviderSyncServiceOptions {
  provider: OrderSyncProviderPort;
  repository: ProviderSyncRepositoryBundle;
  now?: () => string;
}

interface CandidateContext {
  provider: ProviderName;
  sourceEventId: string | null;
  syncedAt: string;
}

interface CandidateResult {
  outcome: WebhookProcessOutcome;
  externalOrderId: string | null;
  orderId: string | null;
  exceptionId: string | null;
  exceptionKind: SyncExceptionKind | null;
  importedCount: number;
  ignoredCount: number;
  exceptionCount: number;
  resolvedExceptionCount: number;
  errorCount: number;
  technicalFailure: boolean;
}

interface RelevantChangeDiff {
  type:
    | "item_added"
    | "item_removed"
    | "menu_item_changed"
    | "name_changed"
    | "quantity_changed"
    | "item_notes_changed"
    | "order_notes_changed"
    | "modifiers_changed";
  externalItemId?: string;
  before?: unknown;
  after?: unknown;
}

interface SnapshotComparisonModifier {
  name: string;
  notes: string | null;
  quantity: number | null;
}

interface SnapshotComparisonItem {
  externalItemId: string;
  catalogExternalId: string | null;
  name: string;
  notes: string | null;
  quantity: number;
  modifiers: SnapshotComparisonModifier[];
}

interface SnapshotComparisonState {
  externalOrderId: string;
  notes: string | null;
  items: SnapshotComparisonItem[];
}

interface RelevantChangeResult {
  baseline: SnapshotComparisonState;
  current: SnapshotComparisonState;
  diffs: RelevantChangeDiff[];
  relevant: boolean;
}

interface ImportedOrderContext {
  aggregate: OrderAggregate;
  importedOrderId: string;
}

export function createProviderSyncService(
  options: CreateProviderSyncServiceOptions,
): ProviderSyncService {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async handleWebhook(input: WebhookInput): Promise<WebhookProcessResult> {
      const normalizedInput = {
        ...input,
        externalOrderId: normalizeOptionalString(input.externalOrderId),
        receivedAt: input.receivedAt ?? now(),
      };

      try {
        const event = options.repository.recordInboundEvent({
          provider: normalizedInput.provider,
          deliveryKey: normalizedInput.deliveryKey,
          eventType: normalizedInput.eventType,
          externalOrderId: normalizedInput.externalOrderId,
          payload: normalizedInput.payload,
          receivedAt: normalizedInput.receivedAt,
        });
        return runWebhookSync({
          externalOrderId: normalizedInput.externalOrderId,
          now,
          provider: options.provider,
          providerName: normalizedInput.provider,
          receivedAt: normalizedInput.receivedAt,
          repository: options.repository,
          sourceEvent: {
            externalOrderId: event.externalOrderId,
            id: event.id,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const existingEvent = options.repository.getInboundEventByDeliveryKey({
            provider: normalizedInput.provider,
            deliveryKey: normalizedInput.deliveryKey,
          });

          if (!existingEvent) {
            throw error;
          }

          if (existingEvent.processStatus === "processed") {
            const externalOrderId =
              normalizedInput.externalOrderId ?? existingEvent.externalOrderId;
            const importedOrder = externalOrderId
              ? findImportedOrderByExternalId(
                  options.repository,
                  normalizedInput.provider,
                  externalOrderId,
                )
              : null;

            return {
              runId: null,
              eventId: null,
              status: "completed",
              outcome: "duplicate_ignored",
              externalOrderId,
              orderId: importedOrder?.importedOrderId ?? null,
              exceptionId: null,
              exceptionKind: null,
            };
          }

          return runWebhookSync({
            externalOrderId:
              normalizedInput.externalOrderId ?? existingEvent.externalOrderId,
            now,
            provider: options.provider,
            providerName: normalizedInput.provider,
            receivedAt: normalizedInput.receivedAt,
            repository: options.repository,
            sourceEvent: {
              externalOrderId: existingEvent.externalOrderId,
              id: existingEvent.id,
            },
          });
        }

        throw error;
      }
    },

    async reconcileConfirmedOrders(
      input: ReconcileInput,
    ): Promise<SyncRunResult> {
      const replayExternalOrderId = normalizeOptionalString(input.externalOrderId);
      const startedAt = now();
      const trigger = replayExternalOrderId ? "replay" : "reconciliation";
      const run = options.repository.startSyncRun({
        provider: input.provider,
        trigger,
        candidateCount: replayExternalOrderId ? 1 : 0,
        startedAt,
      });

      let confirmedCandidates: ProviderOrderSnapshot[] = [];
      let importedExternalOrderIdsToReplay: string[] = [];
      let candidateCount = replayExternalOrderId ? 1 : 0;
      let processed = 0;
      let imported = 0;
      let ignored = 0;
      let openedExceptions = 0;
      let resolvedExceptions = 0;
      let errorCount = 0;
      const applyResult = (result: CandidateResult) => {
        processed += 1;
        imported += result.importedCount;
        ignored += result.ignoredCount;
        openedExceptions += result.exceptionCount;
        resolvedExceptions += result.resolvedExceptionCount;
        errorCount += result.errorCount;
      };

      try {
        if (!replayExternalOrderId) {
          confirmedCandidates = await options.provider.listConfirmedOrders({
            updatedSince: input.updatedSince,
            limit: input.limit,
          });

          const confirmedExternalOrderIds = new Set(
            confirmedCandidates.map((snapshot) => snapshot.externalOrderId),
          );

          // Imported orders must stay in the reconciliation safety net even
          // after they leave the provider's confirmed lifecycle.
          importedExternalOrderIdsToReplay = [
            ...new Set(options.repository.listImportedExternalOrderIds()),
          ].filter((externalOrderId) => {
            return !confirmedExternalOrderIds.has(externalOrderId);
          });
          candidateCount =
            confirmedCandidates.length + importedExternalOrderIdsToReplay.length;
        }

        if (replayExternalOrderId) {
          const result = await syncSingleExternalOrder({
            context: {
              provider: input.provider,
              sourceEventId: null,
              syncedAt: now(),
            },
            externalOrderId: replayExternalOrderId,
            provider: options.provider,
            repository: options.repository,
          });

          applyResult(result);
        } else {
          for (const snapshot of confirmedCandidates) {
            const result = syncCanonicalSnapshot({
              context: {
                provider: input.provider,
                sourceEventId: null,
                syncedAt: now(),
              },
              provider: options.provider,
              repository: options.repository,
              snapshot,
            });

            applyResult(result);
          }

          for (const externalOrderId of importedExternalOrderIdsToReplay) {
            const result = await syncSingleExternalOrder({
              context: {
                provider: input.provider,
                sourceEventId: null,
                syncedAt: now(),
              },
              externalOrderId,
              provider: options.provider,
              repository: options.repository,
            });

            applyResult(result);
          }
        }
      } catch (error) {
        const finishedAt = now();

        options.repository.finishSyncRun({
          syncRunId: run.id,
          status: "failed",
          finishedAt,
          candidateCount,
          importedCount: imported,
          ignoredCount: ignored,
          exceptionCount: openedExceptions,
          errorCount: errorCount + 1,
        });

        throw error;
      }

      const status = errorCount > 0 ? "failed" : "completed";
      options.repository.finishSyncRun({
        syncRunId: run.id,
        status,
        finishedAt: now(),
        candidateCount,
        importedCount: imported,
        ignoredCount: ignored,
        exceptionCount: openedExceptions,
        errorCount,
      });

      return {
        runId: run.id,
        status,
        processed,
        imported,
        ignored,
        openedExceptions,
        resolvedExceptions,
        errorCount,
      };
    },

    async acknowledgeException(input) {
      options.repository.runInTransaction(() => {
        options.repository.acknowledgeException(input);
      });
    },
  };
}

async function runWebhookSync({
  externalOrderId,
  now,
  provider,
  providerName,
  receivedAt,
  repository,
  sourceEvent,
}: {
  externalOrderId: string | null;
  now: () => string;
  provider: OrderSyncProviderPort;
  providerName: ProviderName;
  receivedAt: string;
  repository: ProviderSyncRepositoryBundle;
  sourceEvent: {
    id: string;
    externalOrderId: string | null;
  };
}): Promise<WebhookProcessResult> {
  const run = repository.startSyncRun({
    provider: providerName,
    trigger: "webhook",
    candidateCount: 1,
    startedAt: receivedAt,
    sourceEventId: sourceEvent.id,
  });

  try {
    const result = await syncSingleExternalOrder({
      context: {
        provider: providerName,
        sourceEventId: sourceEvent.id,
        syncedAt: now(),
      },
      externalOrderId: externalOrderId ?? sourceEvent.externalOrderId,
      provider,
      repository,
    });

    const status = result.technicalFailure ? "failed" : "completed";
    const finishedAt = now();

    repository.finishSyncRun({
      syncRunId: run.id,
      status,
      finishedAt,
      candidateCount: 1,
      importedCount: result.importedCount,
      ignoredCount: result.ignoredCount,
      exceptionCount: result.exceptionCount,
      errorCount: result.errorCount,
      event: {
        eventId: sourceEvent.id,
        processStatus: result.technicalFailure ? "failed" : "processed",
        processedAt: finishedAt,
        errorCode: result.technicalFailure ? "ingestion_failed" : null,
        errorMessage:
          result.technicalFailure && result.exceptionKind
            ? `Sync failed with ${result.exceptionKind}`
            : null,
      },
    });

    return {
      runId: run.id,
      eventId: sourceEvent.id,
      status,
      outcome: result.outcome,
      externalOrderId: result.externalOrderId,
      orderId: result.orderId,
      exceptionId: result.exceptionId,
      exceptionKind: result.exceptionKind,
    };
  } catch (error) {
    const finishedAt = now();

    repository.finishSyncRun({
      syncRunId: run.id,
      status: "failed",
      finishedAt,
      candidateCount: 1,
      importedCount: 0,
      ignoredCount: 0,
      exceptionCount: 0,
      errorCount: 1,
      event: {
        eventId: sourceEvent.id,
        processStatus: "failed",
        processedAt: finishedAt,
        errorCode: "sync_apply_failed",
        errorMessage: extractErrorMessage(error),
      },
    });

    throw error;
  }
}

async function syncSingleExternalOrder({
  context,
  externalOrderId,
  provider,
  repository,
}: {
  context: CandidateContext;
  externalOrderId: string | null;
  provider: OrderSyncProviderPort;
  repository: ProviderSyncRepositoryBundle;
}): Promise<CandidateResult> {
  if (!externalOrderId) {
    return repository.runInTransaction(() =>
      openIngestionFailure({
        context,
        errorCode: "missing_external_order_id",
        errorMessage:
          "Inbound provider signal is missing externalOrderId and cannot be fetched canonically",
        externalOrderId: null,
        repository,
      }),
    );
  }

  let snapshot: ProviderOrderSnapshot | null;

  try {
    snapshot = await provider.fetchOrderById(externalOrderId);
  } catch (error) {
    return repository.runInTransaction(() =>
      openIngestionFailure({
        context,
        errorCode: "canonical_fetch_failed",
        errorMessage: extractErrorMessage(error),
        externalOrderId,
        repository,
      }),
    );
  }

  if (!snapshot) {
    return repository.runInTransaction(() =>
      openIngestionFailure({
        context,
        errorCode: "provider_order_not_found",
        errorMessage: `Provider did not return a canonical snapshot for external order "${externalOrderId}"`,
        externalOrderId,
        repository,
      }),
    );
  }

  return syncCanonicalSnapshot({
    context,
    provider,
    repository,
    snapshot,
  });
}

function syncCanonicalSnapshot({
  context,
  provider,
  repository,
  snapshot,
}: {
  context: CandidateContext;
  provider: OrderSyncProviderPort;
  repository: ProviderSyncRepositoryBundle;
  snapshot: ProviderOrderSnapshot;
}): CandidateResult {
  let normalizedOrder: RawProviderOrderInput;

  try {
    normalizedOrder = normalizeSnapshotOrThrow(provider, snapshot);
  } catch (error) {
    return repository.runInTransaction(() =>
      openIngestionFailure({
        context,
        errorCode: "normalization_failed",
        errorMessage: extractErrorMessage(error),
        externalOrderId: snapshot.externalOrderId,
        repository,
      }),
    );
  }

  return repository.runInTransaction(() => {
    const importedContext = findImportedOrderByExternalId(
      repository,
      snapshot.provider,
      snapshot.externalOrderId,
    );

    if (!importedContext) {
      return applyNotYetImportedSnapshot({
        context,
        normalizedOrder,
        repository,
        snapshot,
      });
    }

    return applyImportedSnapshot({
      context,
      importedContext,
      normalizedOrder,
      repository,
      snapshot,
    });
  });
}

function applyNotYetImportedSnapshot({
  context,
  normalizedOrder,
  repository,
  snapshot,
}: {
  context: CandidateContext;
  normalizedOrder: RawProviderOrderInput;
  repository: ProviderSyncRepositoryBundle;
  snapshot: ProviderOrderSnapshot;
}): CandidateResult {
  const state = buildProviderOrderState({
    context,
    importedOrderId: null,
    snapshot,
  });
  let resolvedExceptionCount = resolveTechnicalFailureIfPresent(
    repository,
    snapshot.provider,
    snapshot.externalOrderId,
  );

  if (snapshot.lifecycle !== "confirmed_ready") {
    repository.upsertProviderOrder(state);

    return {
      outcome: "ignored",
      externalOrderId: snapshot.externalOrderId,
      orderId: null,
      exceptionId: null,
      exceptionKind: null,
      importedCount: 0,
      ignoredCount: 1,
      exceptionCount: 0,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  }

  try {
    const splitResult = splitProviderOrder(
      normalizedOrder,
      repository.listKitchenMappings(),
    );
    repository.saveImportedOrder(splitResult);
    repository.upsertProviderOrder({
      ...state,
      importedOrderId: splitResult.order.id,
    });

    resolvedExceptionCount += resolveMatchingExceptionIfPresent(repository, {
      externalOrderId: snapshot.externalOrderId,
      kind: "missing_mapping",
      orderId: null,
      provider: snapshot.provider,
      resolvedVia: "sync_apply_success",
      resolutionNote: "Replay imported the order successfully after mappings were fixed.",
    });

    return {
      outcome: "imported",
      externalOrderId: snapshot.externalOrderId,
      orderId: splitResult.order.id,
      exceptionId: null,
      exceptionKind: null,
      importedCount: 1,
      ignoredCount: 0,
      exceptionCount: 0,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  } catch (error) {
    if (!(error instanceof MissingKitchenMappingError)) {
      throw error;
    }

    repository.upsertProviderOrder(state);

    const exception = openOrRefreshException(repository, {
      provider: snapshot.provider,
      kind: "missing_mapping",
      externalOrderId: snapshot.externalOrderId,
      sourceEventId: context.sourceEventId,
      summary: `Pedido ${snapshot.reference} bloqueado por item sem mapeamento de cozinha`,
      details: {
        menuItemId: error.menuItemId,
        menuItemName: error.menuItemName,
        reference: snapshot.reference,
      },
      detectedAt: context.syncedAt,
      lastSeenAt: context.syncedAt,
    });

    return {
      outcome: exception.action,
      externalOrderId: snapshot.externalOrderId,
      orderId: null,
      exceptionId: exception.record.id,
      exceptionKind: exception.record.kind,
      importedCount: 0,
      ignoredCount: 0,
      exceptionCount: 1,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  }
}

function applyImportedSnapshot({
  context,
  importedContext,
  normalizedOrder,
  repository,
  snapshot,
}: {
  context: CandidateContext;
  importedContext: ImportedOrderContext;
  normalizedOrder: RawProviderOrderInput;
  repository: ProviderSyncRepositoryBundle;
  snapshot: ProviderOrderSnapshot;
}): CandidateResult {
  const existingState = repository.getProviderOrder({
    provider: snapshot.provider,
    externalOrderId: snapshot.externalOrderId,
  });
  const state = buildProviderOrderState({
    context,
    importedOrderId: importedContext.importedOrderId,
    snapshot,
  });
  let resolvedExceptionCount = resolveTechnicalFailureIfPresent(
    repository,
    snapshot.provider,
    snapshot.externalOrderId,
  );

  if (snapshot.lifecycle !== "confirmed_ready") {
    resolvedExceptionCount += resolveMatchingExceptionIfPresent(repository, {
      externalOrderId: snapshot.externalOrderId,
      kind: "changed_externally",
      orderId: importedContext.importedOrderId,
      provider: snapshot.provider,
      resolvedVia: "snapshot_superseded",
      resolutionNote:
        "Changed externally was superseded by an external cancellation state.",
    });

    repository.upsertProviderOrder(state);

    const exception = openOrRefreshException(repository, {
      provider: snapshot.provider,
      kind: "canceled_externally",
      externalOrderId: snapshot.externalOrderId,
      orderId: importedContext.importedOrderId,
      sourceEventId: context.sourceEventId,
      summary: `Pedido ${snapshot.reference} saiu de confirmed_ready no provedor`,
      details: {
        lifecycle: snapshot.lifecycle,
        providerStatus: snapshot.providerStatus,
        providerUpdatedAt: snapshot.providerUpdatedAt,
      },
      detectedAt: context.syncedAt,
      lastSeenAt: context.syncedAt,
    });

    return {
      outcome: exception.action,
      externalOrderId: snapshot.externalOrderId,
      orderId: importedContext.importedOrderId,
      exceptionId: exception.record.id,
      exceptionKind: exception.record.kind,
      importedCount: 0,
      ignoredCount: 0,
      exceptionCount: 1,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  }

  resolvedExceptionCount += resolveMatchingExceptionIfPresent(repository, {
    externalOrderId: snapshot.externalOrderId,
    kind: "canceled_externally",
    orderId: importedContext.importedOrderId,
    provider: snapshot.provider,
    resolvedVia: "snapshot_confirmed_ready",
    resolutionNote: "Provider snapshot returned to a production-valid confirmed state.",
  });

  const currentSnapshotHash = state.snapshotHash;

  if (existingState?.snapshotHash === currentSnapshotHash) {
    repository.upsertProviderOrder(state);

    return {
      outcome: "duplicate_ignored",
      externalOrderId: snapshot.externalOrderId,
      orderId: importedContext.importedOrderId,
      exceptionId: null,
      exceptionKind: null,
      importedCount: 0,
      ignoredCount: 1,
      exceptionCount: 0,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  }

  const currentChangedException = findMatchingUnresolvedException(repository, {
    provider: snapshot.provider,
    kind: "changed_externally",
    externalOrderId: snapshot.externalOrderId,
    orderId: importedContext.importedOrderId,
  });
  const baseline = readComparisonStateFromException(
    currentChangedException,
    "baseline",
  ) ?? buildComparisonState(existingState?.snapshot);
  const relevantChange = classifyRelevantChange({
    baseline,
    importedOrder: importedContext.aggregate,
    normalizedOrder,
    snapshot,
  });

  repository.upsertProviderOrder(state);

  if (!relevantChange.relevant) {
    resolvedExceptionCount += resolveMatchingExceptionIfPresent(repository, {
      externalOrderId: snapshot.externalOrderId,
      kind: "changed_externally",
      orderId: importedContext.importedOrderId,
      provider: snapshot.provider,
      resolvedVia: "snapshot_reconciled",
      resolutionNote: "Canonical snapshot no longer diverges from the imported production order.",
    });

    return {
      outcome:
        existingState?.snapshotHash === currentSnapshotHash
          ? "duplicate_ignored"
          : "ignored",
      externalOrderId: snapshot.externalOrderId,
      orderId: importedContext.importedOrderId,
      exceptionId: null,
      exceptionKind: null,
      importedCount: 0,
      ignoredCount: 1,
      exceptionCount: 0,
      resolvedExceptionCount,
      errorCount: 0,
      technicalFailure: false,
    };
  }

  const exception = openOrRefreshException(repository, {
    provider: snapshot.provider,
    kind: "changed_externally",
    externalOrderId: snapshot.externalOrderId,
    orderId: importedContext.importedOrderId,
    sourceEventId: context.sourceEventId,
    summary: `Pedido ${snapshot.reference} divergiu externamente após a importação`,
    details: {
      baseline: relevantChange.baseline,
      current: relevantChange.current,
      diffs: relevantChange.diffs,
    },
    detectedAt: context.syncedAt,
    lastSeenAt: context.syncedAt,
  });

  return {
    outcome: exception.action,
    externalOrderId: snapshot.externalOrderId,
    orderId: importedContext.importedOrderId,
    exceptionId: exception.record.id,
    exceptionKind: exception.record.kind,
    importedCount: 0,
    ignoredCount: 0,
    exceptionCount: 1,
    resolvedExceptionCount,
    errorCount: 0,
    technicalFailure: false,
  };
}

function buildProviderOrderState({
  context,
  importedOrderId,
  snapshot,
}: {
  context: CandidateContext;
  importedOrderId: string | null;
  snapshot: ProviderOrderSnapshot;
}) {
  return {
    provider: snapshot.provider,
    externalOrderId: snapshot.externalOrderId,
    providerStatus: snapshot.providerStatus,
    lifecycle: snapshot.lifecycle,
    snapshotHash: hashSnapshot(snapshot),
    snapshot,
    lastSeenAt: snapshot.providerUpdatedAt,
    lastAppliedAt: context.syncedAt,
    importedOrderId,
  } as const;
}

function openIngestionFailure({
  context,
  errorCode,
  errorMessage,
  externalOrderId,
  repository,
}: {
  context: CandidateContext;
  errorCode: string;
  errorMessage: string;
  externalOrderId: string | null;
  repository: ProviderSyncRepositoryBundle;
}): CandidateResult {
  const importedContext = externalOrderId
    ? findImportedOrderByExternalId(
        repository,
        context.provider,
        externalOrderId,
      )
    : null;
  const exception = openOrRefreshException(repository, {
    provider: context.provider,
    kind: "ingestion_failed",
    externalOrderId,
    orderId: importedContext?.importedOrderId ?? null,
    sourceEventId: context.sourceEventId,
    summary: "Falha técnica na sincronização do pedido externo",
    details: {
      errorCode,
      errorMessage,
      stage: errorCode.includes("normalization") ? "normalize" : "fetch",
    },
    detectedAt: context.syncedAt,
    lastSeenAt: context.syncedAt,
  });

  return {
    outcome: exception.action,
    externalOrderId,
    orderId: importedContext?.importedOrderId ?? null,
    exceptionId: exception.record.id,
    exceptionKind: exception.record.kind,
    importedCount: 0,
    ignoredCount: 0,
    exceptionCount: 1,
    resolvedExceptionCount: 0,
    errorCount: 1,
    technicalFailure: true,
  };
}

function normalizeSnapshotOrThrow(
  provider: OrderSyncProviderPort,
  snapshot: ProviderOrderSnapshot,
) {
  const normalizedOrder = provider.toProductionInput(snapshot);

  if (!normalizedOrder) {
    throw new Error(
      `Provider "${provider.providerName()}" returned no production input for "${snapshot.externalOrderId}"`,
    );
  }

  return normalizedOrder;
}

function resolveTechnicalFailureIfPresent(
  repository: ProviderSyncRepositoryBundle,
  provider: ProviderName,
  externalOrderId: string,
) {
  return resolveExceptionsByExternalOrder(repository, {
    externalOrderId,
    kind: "ingestion_failed",
    provider,
    resolvedVia: "sync_apply_success",
    resolutionNote:
      "Canonical fetch, normalization, and apply completed successfully.",
  });
}

function resolveMatchingExceptionIfPresent(
  repository: ProviderSyncRepositoryBundle,
  input: {
    provider: ProviderName;
    kind: SyncExceptionKind;
    externalOrderId: string | null;
    orderId: string | null;
    resolvedVia: string;
    resolutionNote: string;
  },
) {
  const existing = findMatchingUnresolvedException(repository, {
    provider: input.provider,
    kind: input.kind,
    externalOrderId: input.externalOrderId,
    orderId: input.orderId,
  });

  if (!existing) {
    return 0;
  }

  repository.resolveException({
    provider: existing.provider,
    kind: existing.kind,
    externalOrderId: existing.externalOrderId,
    orderId: existing.orderId,
    resolvedVia: input.resolvedVia,
    resolutionNote: input.resolutionNote,
  });

  return 1;
}

function openOrRefreshException(
  repository: ProviderSyncRepositoryBundle,
  input: Parameters<ProviderSyncRepository["openOrRefreshException"]>[0],
) {
  const existing = findMatchingUnresolvedException(repository, {
    provider: input.provider,
    kind: input.kind,
    externalOrderId: normalizeOptionalString(input.externalOrderId),
    orderId: normalizeOptionalString(input.orderId),
  });
  const record = repository.openOrRefreshException(input);

  return {
    action: existing ? ("exception_refreshed" as const) : ("exception_opened" as const),
    record,
  };
}

function resolveExceptionsByExternalOrder(
  repository: ProviderSyncRepositoryBundle,
  input: {
    provider: ProviderName;
    kind: SyncExceptionKind;
    externalOrderId: string | null;
    resolvedVia: string;
    resolutionNote: string;
  },
) {
  const matches = repository.listUnresolvedSyncExceptions().filter((exception) => {
    return (
      exception.provider === input.provider &&
      exception.kind === input.kind &&
      normalizeOptionalString(exception.externalOrderId) ===
        normalizeOptionalString(input.externalOrderId)
    );
  });

  for (const exception of matches) {
    repository.resolveException({
      provider: exception.provider,
      kind: exception.kind,
      externalOrderId: exception.externalOrderId,
      orderId: exception.orderId,
      resolvedVia: input.resolvedVia,
      resolutionNote: input.resolutionNote,
    });
  }

  return matches.length;
}

function findMatchingUnresolvedException(
  repository: ProviderSyncRepositoryBundle,
  input: {
    provider: ProviderName;
    kind: SyncExceptionKind;
    externalOrderId: string | null;
    orderId: string | null;
  },
) {
  return repository.listUnresolvedSyncExceptions().find((exception) => {
    return (
      exception.provider === input.provider &&
      exception.kind === input.kind &&
      normalizeOptionalString(exception.externalOrderId) ===
        normalizeOptionalString(input.externalOrderId) &&
      normalizeOptionalString(exception.orderId) ===
        normalizeOptionalString(input.orderId)
    );
  });
}

function findImportedOrderByExternalId(
  repository: ProviderSyncRepositoryBundle,
  provider: ProviderName,
  externalOrderId: string,
): ImportedOrderContext | null {
  const existingState = repository.getProviderOrder({
    provider,
    externalOrderId,
  });

  if (existingState?.importedOrderId) {
    const aggregate = repository.getOrderAggregate(existingState.importedOrderId);

    if (aggregate) {
      return {
        aggregate,
        importedOrderId: aggregate.order.id,
      };
    }
  }

  const aggregate = repository
    .listOrderAggregates()
    .find((entry) => entry.order.externalId === externalOrderId);

  if (!aggregate) {
    return null;
  }

  return {
    aggregate,
    importedOrderId: aggregate.order.id,
  };
}

function classifyRelevantChange({
  baseline,
  importedOrder,
  normalizedOrder,
  snapshot,
}: {
  baseline: SnapshotComparisonState | null;
  importedOrder: OrderAggregate;
  normalizedOrder: RawProviderOrderInput;
  snapshot: ProviderOrderSnapshot;
}): RelevantChangeResult {
  const current = buildComparisonState(snapshot)!;
  const expectedBaseline =
    baseline ??
    buildComparisonStateFromImportedOrder(importedOrder, normalizedOrder.externalId);
  const importedItemsByExternalId = new Map(
    importedOrder.items.map((item) => [item.externalItemId, item]),
  );
  const normalizedItemsByExternalId = new Map(
    normalizedOrder.items.map((item) => [item.externalItemId, item]),
  );
  const baselineItemsByExternalId = new Map(
    expectedBaseline.items.map((item) => [item.externalItemId, item]),
  );
  const diffs: RelevantChangeDiff[] = [];

  for (const [externalItemId, importedItem] of importedItemsByExternalId) {
    const currentItem = normalizedItemsByExternalId.get(externalItemId);

    if (!currentItem) {
      diffs.push({
        type: "item_removed",
        externalItemId,
        before: {
          menuItemId: importedItem.menuItemId,
          quantity: importedItem.quantity,
        },
      });
      continue;
    }

    if (currentItem.menuItemId !== importedItem.menuItemId) {
      diffs.push({
        type: "menu_item_changed",
        externalItemId,
        before: importedItem.menuItemId,
        after: currentItem.menuItemId,
      });
    }

    if (currentItem.name !== importedItem.name) {
      diffs.push({
        type: "name_changed",
        externalItemId,
        before: importedItem.name,
        after: currentItem.name,
      });
    }

    if (currentItem.quantity !== importedItem.quantity) {
      diffs.push({
        type: "quantity_changed",
        externalItemId,
        before: importedItem.quantity,
        after: currentItem.quantity,
      });
    }

    if (normalizeNullableText(currentItem.notes) !== importedItem.notes) {
      diffs.push({
        type: "item_notes_changed",
        externalItemId,
        before: importedItem.notes,
        after: normalizeNullableText(currentItem.notes),
      });
    }

    const baselineItem = baselineItemsByExternalId.get(externalItemId);

    if (
      baselineItem &&
      modifiersSignature(currentItemFromSnapshot(current.items, externalItemId)?.modifiers) !==
        modifiersSignature(baselineItem.modifiers)
    ) {
      diffs.push({
        type: "modifiers_changed",
        externalItemId,
        before: baselineItem.modifiers,
        after: currentItemFromSnapshot(current.items, externalItemId)?.modifiers ?? [],
      });
    }
  }

  for (const [externalItemId, currentItem] of normalizedItemsByExternalId) {
    if (!importedItemsByExternalId.has(externalItemId)) {
      diffs.push({
        type: "item_added",
        externalItemId,
        after: {
          menuItemId: currentItem.menuItemId,
          quantity: currentItem.quantity,
        },
      });
    }
  }

  if (expectedBaseline.notes !== current.notes) {
    diffs.push({
      type: "order_notes_changed",
      before: expectedBaseline.notes,
      after: current.notes,
    });
  }

  return {
    baseline: expectedBaseline,
    current,
    diffs,
    relevant: diffs.length > 0,
  };
}

function buildComparisonState(
  snapshot: ProviderOrderSnapshot | undefined,
): SnapshotComparisonState | null {
  if (!snapshot) {
    return null;
  }

  return {
    externalOrderId: snapshot.externalOrderId,
    notes: normalizeNullableText(snapshot.notes),
    items: snapshot.items
      .map((item) => ({
        externalItemId: item.externalItemId,
        catalogExternalId: item.catalogExternalId,
        name: item.name,
        notes: normalizeNullableText(item.notes),
        quantity: item.quantity,
        modifiers: [...item.modifiers]
          .map((modifier) => ({
            name: modifier.name,
            notes: normalizeNullableText(modifier.notes),
            quantity:
              typeof modifier.quantity === "number" ? modifier.quantity : null,
          }))
          .sort((left, right) =>
            buildModifierSortKey(left).localeCompare(buildModifierSortKey(right)),
          ),
      }))
      .sort((left, right) => left.externalItemId.localeCompare(right.externalItemId)),
  };
}

function buildComparisonStateFromImportedOrder(
  importedOrder: OrderAggregate,
  externalOrderId: string,
): SnapshotComparisonState {
  return {
    externalOrderId,
    notes: null,
    items: importedOrder.items
      .map((item) => ({
        externalItemId: item.externalItemId,
        catalogExternalId: item.menuItemId,
        name: item.name,
        notes: item.notes,
        quantity: item.quantity,
        modifiers: [],
      }))
      .sort((left, right) => left.externalItemId.localeCompare(right.externalItemId)),
  };
}

function currentItemFromSnapshot(
  items: SnapshotComparisonItem[],
  externalItemId: string,
) {
  return items.find((item) => item.externalItemId === externalItemId);
}

function readComparisonStateFromException(
  exception: SyncExceptionRecord | undefined,
  field: "baseline" | "current",
) {
  if (!exception || !isRecord(exception.details)) {
    return null;
  }

  const value = exception.details[field];

  return isSnapshotComparisonState(value) ? value : null;
}

function isSnapshotComparisonState(
  value: unknown,
): value is SnapshotComparisonState {
  return (
    isRecord(value) &&
    typeof value.externalOrderId === "string" &&
    Array.isArray(value.items)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hashSnapshot(snapshot: ProviderOrderSnapshot) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildComparisonState(snapshot)))
    .digest("hex");
}

function modifiersSignature(
  modifiers: SnapshotComparisonModifier[] | undefined,
) {
  if (!modifiers || modifiers.length === 0) {
    return "";
  }

  return modifiers
    .map((modifier) => buildModifierSortKey(modifier))
    .sort((left, right) => left.localeCompare(right))
    .join("|");
}

function buildModifierSortKey(modifier: SnapshotComparisonModifier) {
  return `${modifier.name}::${modifier.quantity ?? ""}::${modifier.notes ?? ""}`;
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function normalizeNullableText(value: string | null | undefined) {
  const normalizedValue = normalizeOptionalString(value);

  return normalizedValue ?? null;
}

function extractErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error && /unique|constraint/i.test(error.message)
  );
}
