import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createConfiguredOrderSyncProvider,
  createOrderSyncProvider,
  orderSyncProviderEnv,
  parseOrderSyncProviderMode,
} from "@/src/infrastructure/order-provider-factory";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("order sync provider factory", () => {
  it("parses only the supported provider modes", () => {
    expect(parseOrderSyncProviderMode("mock")).toBe("mock");
    expect(parseOrderSyncProviderMode(" anota_ai ")).toBe("anota_ai");
    expect(parseOrderSyncProviderMode("")).toBeUndefined();
    expect(parseOrderSyncProviderMode("unknown")).toBeUndefined();
  });

  it("defaults to the mock provider for local fallback flows", async () => {
    const provider = createConfiguredOrderSyncProvider({});
    const snapshots = await provider.listConfirmedOrders({ limit: 1 });

    expect(provider.providerName()).toBe("anota_ai");
    expect(snapshots).toHaveLength(1);
    expect(provider.toProductionInput(snapshots[0])?.items[0]?.menuItemId).toBe(
      snapshots[0]?.items[0]?.catalogExternalId,
    );
  });

  it("selects the Anota adapter when configured by environment", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        success: true,
        info: {
          _id: "real-order",
          check: 1,
          createdAt: "2024-08-09T14:19:58.182Z",
          updatedAt: "2024-08-09T14:20:08.107Z",
          customer: { name: "Cliente real" },
          salesChannel: "anotaai",
          shortReference: 1901,
          items: [
            {
              _id: "real-item",
              id: 1,
              name: "Brownie",
              quantity: 1,
              externalId: "brownie",
              subItems: [],
            },
          ],
        },
      }),
    );
    const provider = createConfiguredOrderSyncProvider(
      {
        [orderSyncProviderEnv.mode]: "anota_ai",
        [orderSyncProviderEnv.anotaAiToken]: "token-real",
      },
      {
        fetch: fetchMock as typeof fetch,
      },
    );
    const snapshot = await provider.fetchOrderById("real-order");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(snapshot).toEqual(
      expect.objectContaining({
        externalOrderId: "real-order",
        lifecycle: "confirmed_ready",
      }),
    );
  });

  it("fails fast when live mode is selected without a token", () => {
    expect(() =>
      createOrderSyncProvider({
        mode: "anota_ai",
      }),
    ).toThrowError(orderSyncProviderEnv.anotaAiToken);
  });

  it("rejects unsupported provider modes instead of silently falling through", () => {
    expect(() =>
      createOrderSyncProvider({
        mode: "legacy" as never,
      }),
    ).toThrowError(/unsupported order sync provider mode/i);
  });
});
