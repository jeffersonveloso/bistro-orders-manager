import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAnotaAiProvider,
  mapAnotaOrderCheck,
  normalizeAnotaOrderSnapshot,
  normalizeProviderSnapshotToProductionInput,
  UnsupportedAnotaPayloadError,
} from "@/src/infrastructure/anota-ai-provider";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createOrderDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    info: {
      _id: "66b6258e890ffb00126c4233",
      check: 1,
      createdAt: "2024-08-09T14:19:58.182Z",
      updatedAt: "2024-08-09T14:20:08.107Z",
      customer: {
        name: "Teste",
      },
      from: "menu-share-adm",
      salesChannel: "anotaai",
      shortReference: 1553,
      observation: "Sem açúcar",
      items: [
        {
          _id: "66b6259876994faecbf911c2",
          id: 0,
          name: "Refrigerante 1L",
          quantity: 1,
          externalId: "iced-coffee",
          subItems: [
            {
              name: "Sem gelo",
              quantity: 1,
              observation: "No ice",
            },
          ],
        },
      ],
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("anota ai provider", () => {
  it("maps provider check codes into the expected phase 1 lifecycle buckets", () => {
    expect(mapAnotaOrderCheck(0)).toMatchObject({
      lifecycle: "pending_confirmation",
      providerStatus: "under_review",
    });
    expect(mapAnotaOrderCheck(1)).toMatchObject({
      lifecycle: "confirmed_ready",
      providerStatus: "in_production",
    });
    expect(mapAnotaOrderCheck(2)).toMatchObject({
      lifecycle: "confirmed_ready",
      providerStatus: "ready",
    });
    expect(mapAnotaOrderCheck(3)).toMatchObject({
      lifecycle: "confirmed_ready",
      providerStatus: "finalized",
    });
    expect(mapAnotaOrderCheck(4)).toMatchObject({
      lifecycle: "canceled",
      providerStatus: "canceled",
    });
    expect(mapAnotaOrderCheck(5)).toMatchObject({
      lifecycle: "canceled",
      providerStatus: "denied",
    });
    expect(mapAnotaOrderCheck(6)).toMatchObject({
      lifecycle: "canceled",
      providerStatus: "cancellation_requested",
    });
    expect(() => mapAnotaOrderCheck(9)).toThrowError(
      /phase 1 lifecycle mapping/i,
    );
  });

  it("fetches and normalizes a canonical Anota snapshot with externalID-driven items", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://api-parceiros.anota.ai/partnerauth/ping/get/66b6258e890ffb00126c4233",
      );
      expect(init?.headers).toMatchObject({
        Accept: "application/json",
        Authorization: "token-123",
        "Content-Type": "application/json",
      });

      return createJsonResponse(createOrderDetailResponse());
    });
    const provider = createAnotaAiProvider({
      fetch: fetchMock as typeof fetch,
      token: "token-123",
    });

    const snapshot = await provider.fetchOrderById("66b6258e890ffb00126c4233");

    expect(snapshot).toEqual(
      expect.objectContaining({
        provider: "anota_ai",
        externalOrderId: "66b6258e890ffb00126c4233",
        reference: "1553",
        customerName: "Teste",
        channel: "anotaai",
        providerStatus: "in_production",
        lifecycle: "confirmed_ready",
        providerUpdatedAt: "2024-08-09T14:20:08.107Z",
        notes: "Sem açúcar",
      }),
    );
    expect(snapshot?.items).toEqual([
      {
        externalItemId: "66b6259876994faecbf911c2",
        catalogExternalId: "iced-coffee",
        name: "Refrigerante 1L",
        quantity: 1,
        modifiers: [
          {
            name: "Sem gelo",
            notes: "No ice",
            quantity: 1,
          },
        ],
      },
    ]);
  });

  it("normalizes confirmed order listings into canonical snapshots consumable downstream", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/ping/list?currentpage=1")) {
        return createJsonResponse({
          success: true,
          info: {
            docs: [
              {
                _id: "order-confirmed",
                check: 1,
                updatedAt: "2024-08-09T14:20:08.107Z",
              },
              {
                _id: "order-pending",
                check: 0,
                updatedAt: "2024-08-09T14:20:08.107Z",
              },
              {
                _id: "order-canceled",
                check: 4,
                updatedAt: "2024-08-09T14:20:08.107Z",
              },
            ],
            count: 3,
            limit: 100,
            currentpage: 1,
          },
        });
      }

      if (url.endsWith("/ping/get/order-confirmed")) {
        return createJsonResponse(
          createOrderDetailResponse({
            _id: "order-confirmed",
            shortReference: 2001,
            items: [
              {
                _id: "item-confirmed",
                id: 1,
                name: "Croissant",
                quantity: 2,
                externalId: "croissant",
                subItems: [],
              },
            ],
          }),
        );
      }

      throw new Error(`unexpected url ${url}`);
    });
    const provider = createAnotaAiProvider({
      fetch: fetchMock as typeof fetch,
      token: "token-123",
    });

    const snapshots = await provider.listConfirmedOrders({
      limit: 5,
      updatedSince: "2024-08-09T14:00:00.000Z",
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual(
      expect.objectContaining({
        externalOrderId: "order-confirmed",
        lifecycle: "confirmed_ready",
      }),
    );
    expect(provider.toProductionInput(snapshots[0])).toEqual({
      externalId: "order-confirmed",
      reference: "2001",
      customerName: "Teste",
      channel: "anotaai",
      createdAt: "2024-08-09T14:20:08.107Z",
      items: [
        {
          externalItemId: "item-confirmed",
          menuItemId: "croissant",
          name: "Croissant",
          quantity: 2,
          notes: undefined,
        },
      ],
    });
  });

  it("uses catalog externalID as menuItemId and rejects missing identifiers", () => {
    const snapshot = normalizeAnotaOrderSnapshot(
      createOrderDetailResponse({
        items: [
          {
            _id: "item-without-external-id",
            name: "Suco de laranja",
            quantity: 1,
            subItems: [],
          },
        ],
      }),
    );

    expect(snapshot.items[0]?.catalogExternalId).toBeNull();
    expect(() => normalizeProviderSnapshotToProductionInput(snapshot)).toThrowError(
      /missing catalog externalid/i,
    );
  });

  it("surfaces descriptive failures for unsupported or incomplete provider payloads", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        success: true,
        info: {
          _id: "broken-order",
          check: 1,
          updatedAt: "2024-08-09T14:20:08.107Z",
          items: "not-an-array",
        },
      }),
    );
    const provider = createAnotaAiProvider({
      fetch: fetchMock as typeof fetch,
      token: "token-123",
    });

    await expect(provider.fetchOrderById("broken-order")).rejects.toThrowError(
      UnsupportedAnotaPayloadError,
    );
    await expect(provider.fetchOrderById("broken-order")).rejects.toThrowError(
      /items must be an array/i,
    );
  });

  it("returns null for 404 canonical fetches and rejects list entries that cannot be fetched canonically", async () => {
    const provider404 = createAnotaAiProvider({
      fetch: vi.fn(async () => createJsonResponse({ message: "not found" }, 404)) as typeof fetch,
      token: "token-123",
    });

    await expect(provider404.fetchOrderById("missing-order")).resolves.toBeNull();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/ping/list?currentpage=1")) {
        return createJsonResponse({
          success: true,
          info: {
            docs: [
              {
                _id: "missing-canonical-order",
                check: 1,
                updatedAt: "2024-08-09T14:20:08.107Z",
              },
            ],
            count: 1,
            limit: 100,
            currentpage: 1,
          },
        });
      }

      if (url.endsWith("/ping/get/missing-canonical-order")) {
        return createJsonResponse({ message: "not found" }, 404);
      }

      throw new Error(`unexpected url ${url}`);
    });
    const provider = createAnotaAiProvider({
      fetch: fetchMock as typeof fetch,
      token: "token-123",
    });

    await expect(provider.listConfirmedOrders({ limit: 1 })).rejects.toThrowError(
      /canonical fetch returned no order details/i,
    );
  });

  it("handles malformed transport responses, unsuccessful envelopes, and custom list defaults", async () => {
    const malformedProvider = createAnotaAiProvider({
      fetch: vi.fn(
        async () =>
          new Response("not-json", {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          }),
      ) as typeof fetch,
      token: "token-123",
    });

    await expect(malformedProvider.fetchOrderById("broken-json")).rejects.toThrowError(
      /not valid json/i,
    );

    const unsuccessfulProvider = createAnotaAiProvider({
      fetch: vi.fn(async () =>
        createJsonResponse({
          success: false,
          message: "pedido indisponível",
        }),
      ) as typeof fetch,
      token: "token-123",
    });

    await expect(
      unsuccessfulProvider.fetchOrderById("unsuccessful-order"),
    ).rejects.toThrowError(/pedido indisponível/i);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/root/ping/list?currentpage=1")) {
        return createJsonResponse({
          success: true,
          info: {
            docs: [
              {
                _id: "stringly-typed-order",
                check: "1",
                updatedAt: "2024-08-09T14:20:08.107Z",
              },
            ],
            count: "2",
            limit: "1",
            currentpage: "1",
          },
        });
      }

      if (url.endsWith("/root/ping/list?currentpage=2")) {
        return createJsonResponse({
          success: true,
          info: {
            docs: [
              {
                _id: "stringly-typed-order-2",
                check: "2",
                updatedAt: "2024-08-09T14:21:08.107Z",
              },
            ],
            count: "2",
            limit: "1",
            currentpage: "2",
          },
        });
      }

      if (url.endsWith("/root/ping/get/stringly-typed-order")) {
        return createJsonResponse(
          createOrderDetailResponse({
            _id: "stringly-typed-order",
            items: [
              {
                _id: "string-item",
                id: 1,
                name: "Suco",
                quantity: "2",
                externalId: "orange-juice",
                subItems: null,
              },
            ],
          }),
        );
      }

      if (url.endsWith("/root/ping/get/stringly-typed-order-2")) {
        return createJsonResponse(
          createOrderDetailResponse({
            _id: "stringly-typed-order-2",
            items: [
              {
                _id: "string-item-2",
                id: 2,
                name: "Brownie",
                quantity: "1",
                external_id: "brownie",
                subItems: [],
              },
            ],
          }),
        );
      }

      throw new Error(`unexpected url ${url}`);
    });
    const provider = createAnotaAiProvider({
      baseUrl: "https://example.test/root/",
      fetch: fetchMock as typeof fetch,
      token: "token-123",
    });
    const snapshots = await provider.listConfirmedOrders({});

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.test/root/ping/list?currentpage=1",
      }),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "https://example.test/root/ping/list?currentpage=2",
      }),
      expect.any(Object),
    );
    expect(snapshots).toHaveLength(2);
    expect(provider.toProductionInput(snapshots[0]).items[0]?.quantity).toBe(2);
    expect(provider.toProductionInput(snapshots[1]).items[0]?.menuItemId).toBe(
      "brownie",
    );
    expect(() =>
      createAnotaAiProvider({
        token: "   ",
      }),
    ).toThrowError(/token is required/i);
  });

  it("surfaces request failures, non-object envelopes, and missing required identifiers descriptively", async () => {
    const requestFailureProvider = createAnotaAiProvider({
      fetch: vi.fn(async () =>
        createJsonResponse(
          {
            message: "falha upstream",
          },
          500,
        ),
      ) as typeof fetch,
      token: "token-123",
    });

    await expect(
      requestFailureProvider.fetchOrderById("order-500"),
    ).rejects.toThrowError(/status 500: falha upstream/i);

    const nonObjectProvider = createAnotaAiProvider({
      fetch: vi.fn(async () => createJsonResponse("not-an-object")) as typeof fetch,
      token: "token-123",
    });

    await expect(nonObjectProvider.fetchOrderById("order-string")).rejects.toThrowError(
      /response must be an object/i,
    );

    const missingIdProvider = createAnotaAiProvider({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith("/ping/list?currentpage=1")) {
          return createJsonResponse({
            success: true,
            info: {
              docs: [
                {
                  check: 1,
                  updatedAt: "2024-08-09T14:20:08.107Z",
                },
              ],
              count: 1,
              limit: 100,
              currentpage: 1,
            },
          });
        }

        throw new Error(`unexpected url ${url}`);
      }) as typeof fetch,
      token: "token-123",
    });

    await expect(
      missingIdProvider.listConfirmedOrders({ limit: 1 }),
    ).rejects.toThrowError(/entry #1 _id is required/i);
  });
});
