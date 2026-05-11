import { describe, expect, it } from "vitest";

import {
  createMockOrderProvider,
  createMockOrderSyncProvider,
} from "@/src/infrastructure/mock-order-provider";

describe("mock order provider compatibility", () => {
  it("keeps the legacy demo ingestion contract intact", () => {
    const provider = createMockOrderProvider();
    const orders = provider.listOrders();

    expect(orders).toHaveLength(5);
    expect(orders[0]).toEqual(
      expect.objectContaining({
        externalId: "anota-101",
        reference: "Pedido 101",
      }),
    );
  });

  it("supports the expanded sync provider contract for local fallback flows", async () => {
    const provider = createMockOrderSyncProvider();
    const snapshots = await provider.listConfirmedOrders({ limit: 2 });
    const snapshot = await provider.fetchOrderById("anota-101");

    expect(provider.providerName()).toBe("anota_ai");
    expect(snapshots).toHaveLength(2);
    expect(snapshot).toEqual(
      expect.objectContaining({
        externalOrderId: "anota-101",
        lifecycle: "confirmed_ready",
      }),
    );
    expect(provider.toProductionInput(snapshot!).items[0]?.menuItemId).toBe(
      snapshot?.items[0]?.catalogExternalId,
    );
  });

  it("supports updatedSince filtering, unbounded listing, and missing-order fetches", async () => {
    const provider = createMockOrderSyncProvider();
    const allSnapshots = await provider.listConfirmedOrders({});
    const filteredSnapshots = await provider.listConfirmedOrders({
      updatedSince: new Date(Date.now() - 5 * 60_000).toISOString(),
    });

    expect(allSnapshots).toHaveLength(5);
    expect(filteredSnapshots.map((snapshot) => snapshot.externalOrderId)).toEqual([
      "anota-104",
      "anota-105",
    ]);
    await expect(provider.fetchOrderById("missing-order")).resolves.toBeNull();
  });
});
