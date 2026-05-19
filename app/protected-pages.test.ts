import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  requireAreaPageAccess,
  requireKitchenPageAccess,
  requireSalonPageAccess,
} from "@/app/_lib/area-access-page";
import CatalogPage, { loadCatalogPage } from "@/app/catalog/page";
import { loadOrderPage } from "@/app/orders/[orderId]/page";
import Home, { loadHomePage } from "@/app/page";
import SalonPage, { loadSalonPage } from "@/app/salon/page";
import type { AreaId } from "@/src/domain/area-access";
import type { AreaAccessRuntimeConfig } from "@/src/infrastructure/area-session";
import {
  areaAccessCookieName,
  signAreaSession,
} from "@/src/infrastructure/area-session";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

const { cookiesMock, notFoundMock, redirectMock } = vi.hoisted(() => {
  return {
    cookiesMock: vi.fn(),
    notFoundMock: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    redirectMock: vi.fn((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    }),
  };
});

const originalEnv = { ...process.env };

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

function createRuntimeConfig(): AreaAccessRuntimeConfig {
  return {
    cookieName: areaAccessCookieName,
    pins: {
      "kitchen-1": "1111",
      "kitchen-2": "2222",
      salon: "3333",
    },
    renewalWindowMs: 4 * 60 * 60 * 1000,
    renewalWindowRatio: 0.25,
    secureCookies: false,
    sessionSecret: "page-secret",
    sessionTtlHours: 16,
    sessionTtlMs: 16 * 60 * 60 * 1000,
    sessionTtlSeconds: 16 * 60 * 60,
  };
}

function createCookieStore(
  config: AreaAccessRuntimeConfig,
  areaId?: AreaId,
  expiresAt = "2099-12-31T23:59:59.000Z",
): { get(name: string): { value: string } | undefined } {
  return {
    get(name: string) {
      if (name !== config.cookieName || !areaId) {
        return undefined;
      }

      return {
        value: signAreaSession(
          {
            areaId,
            expiresAt,
            issuedAt: "2026-05-13T00:00:00.000Z",
            version: 1,
          },
          config,
        ),
      };
    },
  };
}

describe("protected server pages", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    notFoundMock.mockClear();
    redirectMock.mockClear();
    redirectMock.mockImplementation((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects unauthenticated access to app/page.tsx before refresh runs", async () => {
    const refresh = vi.fn(async () => {});

    await expect(
      loadHomePage({
        config: createRuntimeConfig(),
        cookieStore: createCookieStore(createRuntimeConfig()),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/access");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reads the session from next/headers when no cookieStore dependency is injected", async () => {
    const config = createRuntimeConfig();
    cookiesMock.mockResolvedValue(createCookieStore(config, "kitchen-1"));

    const result = await requireAreaPageAccess({
      config,
      now: new Date("2026-05-13T12:00:00.000Z"),
    });

    expect(cookiesMock).toHaveBeenCalledTimes(1);
    expect(result.session.areaId).toBe("kitchen-1");
  });

  it("redirects expired sessions to /access?reason=expired", async () => {
    const config = createRuntimeConfig();

    await expect(
      requireAreaPageAccess({
        config,
        cookieStore: createCookieStore(
          config,
          "kitchen-1",
          "2026-05-13T10:00:00.000Z",
        ),
        now: new Date("2026-05-13T12:00:00.000Z"),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/access?reason=expired");
  });

  it("rethrows unexpected kitchen authorization errors from the shared page guard", async () => {
    const config = createRuntimeConfig();

    await expect(
      requireKitchenPageAccess({
        areaAccessService: {
          authenticate: vi.fn(),
          requireKitchenArea: vi.fn(() => {
            throw new Error("kitchen guard failed");
          }),
          requireSalonArea: vi.fn(),
          resolveFocusKitchen: vi.fn(),
          resolveNextTarget: vi.fn(),
        },
        config,
        cookieStore: createCookieStore(config, "kitchen-1"),
        now: new Date("2026-05-13T12:00:00.000Z"),
      }),
    ).rejects.toThrow("kitchen guard failed");
  });

  it("rethrows unexpected salão authorization errors from the shared page guard", async () => {
    const config = createRuntimeConfig();

    await expect(
      requireSalonPageAccess({
        areaAccessService: {
          authenticate: vi.fn(),
          requireKitchenArea: vi.fn(),
          requireSalonArea: vi.fn(() => {
            throw new Error("salon guard failed");
          }),
          resolveFocusKitchen: vi.fn(),
          resolveNextTarget: vi.fn(),
        },
        config,
        cookieStore: createCookieStore(config, "salon"),
        now: new Date("2026-05-13T12:00:00.000Z"),
      }),
    ).rejects.toThrow("salon guard failed");
  });

  it("redirects to /access when the page auth runtime configuration is missing", async () => {
    await expect(
      requireAreaPageAccess({
        env: {
          BISTRO_ACCESS_PIN_KITCHEN_1: "1111",
          BISTRO_ACCESS_PIN_KITCHEN_2: "2222",
          BISTRO_ACCESS_PIN_SALON: "3333",
        },
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/access");
  });

  it("redirects a salão session from / to /salon before refresh runs", async () => {
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    await expect(
      loadHomePage({
        config,
        cookieStore: createCookieStore(config, "salon"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/salon");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps authorized kitchen board bootstrap working after the page guard", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const result = await loadHomePage({
        config,
        cookieStore: createCookieStore(config, "kitchen-1"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
        repository: context.repository,
      });

      expect(result.activeKitchenId).toBe("kitchen-1");
      expect(result.initialData.kitchens).toHaveLength(2);
      expect(result.initialData.generatedAt).toEqual(expect.any(String));
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      context.close();
    }
  });

  it("renders the protected kitchen page after auth succeeds", async () => {
    process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = "1111";
    process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = "2222";
    process.env.BISTRO_ACCESS_PIN_SALON = "3333";
    process.env.BISTRO_ACCESS_SESSION_SECRET = "page-secret";
    cookiesMock.mockResolvedValue(
      createCookieStore(createRuntimeConfig(), "kitchen-1"),
    );

    const page = (await Home()) as {
      props: {
        activeKitchenId: string;
        initialData: { kitchens: unknown[] };
      };
    };

    expect(page.props.activeKitchenId).toBe("kitchen-1");
    expect(page.props.initialData.kitchens).toHaveLength(2);
  });

  it("loads the salão page only for a salão session and rejects kitchen sessions before refresh", async () => {
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    await expect(
      loadSalonPage({
        config,
        cookieStore: createCookieStore(config, "kitchen-2"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the salão bootstrap working after auth succeeds", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const result = await loadSalonPage({
        config,
        cookieStore: createCookieStore(config, "salon"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
        repository: context.repository,
      });

      expect(result.initialData.summary.length).toBeGreaterThan(0);
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      context.close();
    }
  });

  it("renders the protected salão page after auth succeeds", async () => {
    process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = "1111";
    process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = "2222";
    process.env.BISTRO_ACCESS_PIN_SALON = "3333";
    process.env.BISTRO_ACCESS_SESSION_SECRET = "page-secret";
    process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = "mock";
    cookiesMock.mockResolvedValue(createCookieStore(createRuntimeConfig(), "salon"));

    const page = (await SalonPage()) as {
      props: { initialData: { summary: unknown[] } };
    };

    expect(Array.isArray(page.props.initialData.summary)).toBe(true);
  });

  it("defaults /orders/[orderId] to the authenticated kitchen without redirecting", async () => {
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    const result = await loadOrderPage(
      {
        params: Promise.resolve({ orderId: "order_anota-101" }),
        searchParams: Promise.resolve({}),
      },
      {
        config,
        cookieStore: createCookieStore(config, "kitchen-1"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
      },
    );

    expect(result.focusKitchenId).toBe("kitchen-1");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("redirects a kitchen away from an order detail it does not own before refresh runs", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      await expect(
        loadOrderPage(
          {
            params: Promise.resolve({ orderId: "order_anota-105" }),
            searchParams: Promise.resolve({ kitchen: "kitchen-2" }),
          },
          {
            config,
            cookieStore: createCookieStore(config, "kitchen-2"),
            now: new Date("2026-05-13T12:00:00.000Z"),
            refresh,
            repository: context.repository,
          },
        ),
      ).rejects.toThrow("NEXT_REDIRECT:/");
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      context.close();
    }
  });

  it("keeps authorized order-detail bootstrap working after canonical routing", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const result = await loadOrderPage(
        {
          params: Promise.resolve({ orderId: "order_anota-101" }),
          searchParams: Promise.resolve({ kitchen: "kitchen-1" }),
        },
        {
          config,
          cookieStore: createCookieStore(config, "kitchen-1"),
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );

      expect(result.kitchenId).toBe("kitchen-1");
      expect(result.initialData.focusKitchenId).toBe("kitchen-1");
      expect(result.orderId).toBe("order_anota-101");
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      context.close();
    }
  });

  it("keeps the protected catalog page available for kitchens and redirects salão away", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const catalogAdminProvider = {
      getCatalogExternalIdSupport: vi.fn(() => ({
        provider: "anota_ai",
        providerLabel: "Anota AI",
        mode: "manual_assist" as const,
        actionLabel: "Copiar external ID",
        summary: "External IDs precisam ser copiados manualmente.",
        helpUrl: null,
        instructions: ["Copie o external ID do painel do provider."],
      })),
      listCatalogItems: vi.fn(async () => []),
      providerName: vi.fn(() => "anota_ai" as const),
      publishExternalId: vi.fn(async () => ({
        status: "skipped" as const,
        providerMessage: null,
      })),
    };

    try {
      const result = await loadCatalogPage({
        catalogAdminProvider,
        config,
        cookieStore: createCookieStore(config, "kitchen-1"),
        now: new Date("2026-05-13T12:00:00.000Z"),
        repository: context.repository,
      });

      expect(result.initialData.generatedAt).toEqual(expect.any(String));
      expect(result.initialData.metrics.totalMappings).toBeGreaterThan(0);
      expect(catalogAdminProvider.listCatalogItems).toHaveBeenCalledWith({
        limit: 500,
      });

      await expect(
        loadCatalogPage({
          catalogAdminProvider,
          config,
          cookieStore: createCookieStore(config, "salon"),
          now: new Date("2026-05-13T12:00:00.000Z"),
          repository: context.repository,
        }),
      ).rejects.toThrow("NEXT_REDIRECT:/salon");
    } finally {
      context.close();
    }
  });

  it("runs the protected catalog page through the kitchen-only default export", async () => {
    process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = "1111";
    process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = "2222";
    process.env.BISTRO_ACCESS_PIN_SALON = "3333";
    process.env.BISTRO_ACCESS_SESSION_SECRET = "page-secret";
    process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = "mock";
    cookiesMock.mockResolvedValue(
      createCookieStore(createRuntimeConfig(), "kitchen-1"),
    );

    await expect(CatalogPage()).resolves.toBeTruthy();
  });
});
