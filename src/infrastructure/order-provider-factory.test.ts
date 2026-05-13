import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCatalogAdminProvider,
  createConfiguredCatalogAdminProvider,
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

  it("creates a provider-agnostic catalog admin capability from the same mode selection", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/v2/nm-category/rest/simple-item/export/v2")) {
        return createJsonResponse({
          success: true,
          message: "Menu exportado com sucesso.",
          data: [
            {
              title: "Lanches",
              id: "category-1",
              itens: [
                {
                  id: "catalog-item-1",
                  title: "Club Sandwich",
                  external_id: "club-sandwich",
                  updatedAt: "2026-05-12T12:00:00.000Z",
                },
              ],
            },
          ],
        });
      }

      if (url.endsWith("/v2/item/external-id/provider-item-1")) {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBe(
          JSON.stringify({
            document: {
              external_id: "uuid-1",
            },
          }),
        );

        return createJsonResponse({
          success: true,
          message: "External ID atualizado com sucesso.",
        });
      }

      throw new Error(`unexpected url ${url}`);
    });
    const provider = createConfiguredCatalogAdminProvider({
      [orderSyncProviderEnv.mode]: "anota_ai",
      [orderSyncProviderEnv.anotaAiToken]: "token-real",
    }, {
      fetch: fetchMock as typeof fetch,
    });

    expect(provider.providerName()).toBe("anota_ai");
    expect(provider.getCatalogExternalIdSupport()).toEqual(
      expect.objectContaining({
        provider: "anota_ai",
        mode: "api_write",
        actionLabel: expect.any(String),
      }),
    );
    await expect(provider.listCatalogItems({ limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        providerItemId: "catalog-item-1",
        providerExternalId: "club-sandwich",
        name: "Club Sandwich",
      }),
    ]);
    await expect(
      provider.publishExternalId({
        providerItemId: "provider-item-1",
        externalId: "uuid-1",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        status: "published",
      }),
    );
  });

  it("uses the dedicated Anota menu base by default for catalog reads even when the order base is configured", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      expect(url).toBe(
        "https://api-menu.anota.ai/partnerauth/v2/nm-category/rest/simple-item/export/v2",
      );

      return createJsonResponse({
        success: true,
        data: [
          {
            title: "Bebidas",
            itens: [
              {
                id: "catalog-item-1",
                title: "Cappuccino",
                external_id: "cappuccino",
                updatedAt: "2026-05-12T12:00:00.000Z",
              },
            ],
          },
        ],
      });
    });
    const provider = createConfiguredCatalogAdminProvider(
      {
        [orderSyncProviderEnv.mode]: "anota_ai",
        [orderSyncProviderEnv.anotaAiBaseUrl]:
          "https://api-parceiros.anota.ai/partnerauth",
        [orderSyncProviderEnv.anotaAiToken]: "token-real",
      },
      {
        fetch: fetchMock as typeof fetch,
      },
    );

    await expect(provider.listCatalogItems({ limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        providerItemId: "catalog-item-1",
        providerExternalId: "cappuccino",
        name: "Cappuccino",
      }),
    ]);
  });

  it("rejects unsupported catalog admin provider modes", () => {
    expect(() =>
      createCatalogAdminProvider({
        mode: "legacy" as never,
      }),
    ).toThrowError(/unsupported catalog admin provider mode/i);
  });
});
