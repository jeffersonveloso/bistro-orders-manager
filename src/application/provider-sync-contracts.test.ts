import { describe, expect, it } from "vitest";

import type {
  OrderSyncProviderPort,
  ProviderSyncRepository,
} from "@/src/application/ports";
import {
  createProviderOrderReference,
  type InboundProviderEvent,
  type ProviderOrderSnapshot,
  type ProviderOrderState,
} from "@/src/domain/provider-sync";

function createSnapshot(): ProviderOrderSnapshot {
  return {
    provider: "anota_ai",
    externalOrderId: "external-101",
    reference: "Pedido 101",
    customerName: "Mesa 4",
    channel: "mock-anota-ai",
    providerStatus: "CONFIRMED",
    lifecycle: "confirmed_ready",
    providerUpdatedAt: "2026-05-11T10:00:00.000Z",
    items: [
      {
        externalItemId: "item-1",
        catalogExternalId: "iced-coffee",
        name: "Café gelado",
        quantity: 2,
        modifiers: [],
      },
    ],
    notes: "Sem açúcar",
    rawPayload: { id: "external-101" },
  };
}

describe("provider sync port contracts", () => {
  it("supports typed provider and repository doubles for sync orchestration", async () => {
    const snapshot = createSnapshot();
    const provider = {
      providerName() {
        return "anota_ai";
      },
      async fetchOrderById(externalOrderId: string) {
        return externalOrderId === snapshot.externalOrderId ? snapshot : null;
      },
      async listConfirmedOrders() {
        return [snapshot];
      },
      toProductionInput(nextSnapshot) {
        return {
          externalId: nextSnapshot.externalOrderId,
          reference: nextSnapshot.reference,
          customerName: nextSnapshot.customerName,
          channel: nextSnapshot.channel,
          createdAt: nextSnapshot.providerUpdatedAt,
          items: nextSnapshot.items.map((item) => ({
            externalItemId: item.externalItemId,
            menuItemId: item.catalogExternalId ?? "",
            name: item.name,
            quantity: item.quantity,
            notes: item.notes,
          })),
        };
      },
    } satisfies OrderSyncProviderPort;

    const stateByOrderId = new Map<string, ProviderOrderState>();

    const repository = {
      recordInboundEvent(event: InboundProviderEvent) {
        return {
          id: "event-1",
          provider: event.provider,
          deliveryKey: event.deliveryKey,
          eventType: event.eventType,
          externalOrderId: event.externalOrderId ?? null,
          payload: event.payload,
          receivedAt: event.receivedAt,
          processedAt: null,
          processStatus: "received",
          syncRunId: null,
          errorCode: null,
          errorMessage: null,
        };
      },
      startSyncRun(input) {
        return {
          id: "run-1",
          provider: input.provider,
          trigger: input.trigger,
          status: "running",
          startedAt: input.startedAt ?? "2026-05-11T10:00:00.000Z",
          finishedAt: null,
          candidateCount: input.candidateCount ?? 0,
          importedCount: 0,
          ignoredCount: 0,
          exceptionCount: 0,
          errorCount: 0,
        };
      },
      finishSyncRun() {},
      getProviderOrder(input) {
        return stateByOrderId.get(`${input.provider}:${input.externalOrderId}`);
      },
      upsertProviderOrder(state) {
        stateByOrderId.set(`${state.provider}:${state.externalOrderId}`, state);
      },
      openOrRefreshException(input) {
        return {
          id: "exception-1",
          provider: input.provider,
          externalOrderId: input.externalOrderId ?? null,
          orderId: input.orderId ?? null,
          sourceEventId: input.sourceEventId ?? null,
          kind: input.kind,
          status: "open",
          summary: input.summary,
          details: input.details ?? null,
          detectedAt: input.detectedAt ?? "2026-05-11T10:00:00.000Z",
          lastSeenAt: input.lastSeenAt ?? "2026-05-11T10:00:00.000Z",
          acknowledgedAt: null,
          acknowledgedVia: null,
          resolvedAt: null,
          resolvedVia: null,
          resolutionNote: null,
        };
      },
      acknowledgeException() {},
      resolveException() {},
      runInTransaction<T>(work: () => T) {
        return work();
      },
    } satisfies ProviderSyncRepository;

    const event = repository.recordInboundEvent({
      provider: "anota_ai",
      deliveryKey: "delivery-101",
      eventType: "order.confirmed",
      externalOrderId: snapshot.externalOrderId,
      payload: snapshot.rawPayload,
      receivedAt: "2026-05-11T10:00:00.000Z",
    });

    const run = repository.startSyncRun({
      provider: provider.providerName(),
      trigger: "webhook",
      candidateCount: 1,
      sourceEventId: event.id,
    });

    const fetchedSnapshot = await provider.fetchOrderById(snapshot.externalOrderId);

    expect(fetchedSnapshot?.lifecycle).toBe("confirmed_ready");

    repository.runInTransaction(() => {
      repository.upsertProviderOrder({
        ...createProviderOrderReference({
          provider: provider.providerName(),
          externalOrderId: snapshot.externalOrderId,
        }),
        providerStatus: snapshot.providerStatus,
        lifecycle: snapshot.lifecycle,
        snapshotHash: "hash-101",
        snapshot,
        lastSeenAt: snapshot.providerUpdatedAt,
        lastAppliedAt: null,
        importedOrderId: null,
      });
    });

    const savedOrder = repository.getProviderOrder(
      createProviderOrderReference({
        provider: provider.providerName(),
        externalOrderId: snapshot.externalOrderId,
      }),
    );

    expect(run.status).toBe("running");
    expect(savedOrder?.snapshot.reference).toBe("Pedido 101");
    expect(provider.toProductionInput(snapshot)?.items[0]?.menuItemId).toBe(
      "iced-coffee",
    );
  });
});
