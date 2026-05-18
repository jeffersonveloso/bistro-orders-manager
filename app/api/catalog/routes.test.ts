import { describe, expect, it, vi } from "vitest";

import {
  GET as getCatalogMappingsRouteExport,
  handleGetCatalogMappings,
  handleGetCatalogMappingsRoute,
  POST as postCatalogMappingRouteExport,
  handlePostCatalogMapping,
  handlePostCatalogMappingRoute,
} from "@/app/api/catalog/mappings/route";
import {
  POST as postProviderCatalogPullRouteExport,
  handlePostProviderCatalogPull,
  handlePostProviderCatalogPullRoute,
} from "@/app/api/catalog/provider-pull/route";
import type {
  CatalogAdminProviderPort,
  ProviderSyncService,
} from "@/src/application/ports";
import type { CatalogMappingRepository } from "@/src/application/catalog-mapping-service";
import type { AreaAccessRuntimeConfig } from "@/src/infrastructure/area-session";
import { signAreaSession } from "@/src/infrastructure/area-session";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createRuntimeConfig(): AreaAccessRuntimeConfig {
  return {
    cookieName: "bistro_area_session",
    pins: {
      "kitchen-1": "1111",
      "kitchen-2": "2222",
      salon: "3333",
    },
    renewalWindowMs: 4 * 60 * 60 * 1000,
    renewalWindowRatio: 0.25,
    secureCookies: false,
    sessionSecret: "route-secret",
    sessionTtlHours: 16,
    sessionTtlMs: 16 * 60 * 60 * 1000,
    sessionTtlSeconds: 16 * 60 * 60,
  };
}

function createCookieHeader(
  config: AreaAccessRuntimeConfig,
  areaId: "kitchen-1" | "kitchen-2" | "salon",
) {
  return `${config.cookieName}=${signAreaSession(
    {
      areaId,
      expiresAt: "2099-12-31T23:59:59.000Z",
      issuedAt: "2026-05-13T00:00:00.000Z",
      version: 1,
    },
    config,
  )}`;
}

function createGetRequest(path: string, cookieHeader?: string) {
  return new Request(`http://localhost${path}`, {
    headers: cookieHeader
      ? {
          cookie: cookieHeader,
        }
      : undefined,
  });
}

function createJsonRequest(
  path: string,
  body: Record<string, unknown>,
  cookieHeader?: string,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function createRawJsonRequest(
  path: string,
  rawBody: string,
  cookieHeader?: string,
) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: rawBody,
  });
}

function createCatalogAdminProvider(
  overrides: Partial<CatalogAdminProviderPort> = {},
): CatalogAdminProviderPort {
  return {
    providerName: () => "anota_ai",
    getCatalogExternalIdSupport: () => ({
      provider: "anota_ai",
      providerLabel: "Anota AI",
      mode: "manual_assist",
      actionLabel: "Copiar external ID",
      summary: "External IDs precisam ser copiados manualmente.",
      helpUrl: null,
      instructions: ["Copie o external ID do painel do provider."],
    }),
    listCatalogItems: async () => [],
    publishExternalId: async () => ({
      status: "skipped",
      providerMessage: null,
    }),
    ...overrides,
  };
}

function createCatalogRepositorySpy(): CatalogMappingRepository {
  return {
    listKitchens: vi.fn(() => []),
    listKitchenMappings: vi.fn(() => []),
    upsertKitchenMapping: vi.fn(),
    listProviderCatalogItems: vi.fn(() => []),
    upsertProviderCatalogItems: vi.fn(),
    listProviderOrders: vi.fn(() => []),
    listUnresolvedSyncExceptions: vi.fn(() => []),
  };
}

function createSyncService(): ProviderSyncService {
  return {
    acknowledgeException: vi.fn(async () => {}),
    handleWebhook: vi.fn(async () => ({
      runId: null,
      eventId: null,
      status: "completed",
      outcome: "ignored",
      externalOrderId: null,
      orderId: null,
      exceptionId: null,
      exceptionKind: null,
    })),
    reconcileConfirmedOrders: vi.fn(async () => ({
      runId: "sync-run-1",
      status: "completed",
      processed: 0,
      imported: 0,
      ignored: 0,
      openedExceptions: 0,
      resolvedExceptions: 0,
      errorCount: 0,
    })),
  };
}

function setAccessRuntimeEnv(config: AreaAccessRuntimeConfig) {
  const previous = {
    BISTRO_ACCESS_PIN_KITCHEN_1: process.env.BISTRO_ACCESS_PIN_KITCHEN_1,
    BISTRO_ACCESS_PIN_KITCHEN_2: process.env.BISTRO_ACCESS_PIN_KITCHEN_2,
    BISTRO_ACCESS_PIN_SALON: process.env.BISTRO_ACCESS_PIN_SALON,
    BISTRO_ACCESS_SESSION_SECRET: process.env.BISTRO_ACCESS_SESSION_SECRET,
    BISTRO_ACCESS_SESSION_TTL_HOURS:
      process.env.BISTRO_ACCESS_SESSION_TTL_HOURS,
    BISTRO_ORDER_SYNC_PROVIDER_MODE:
      process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE,
  };

  process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = config.pins["kitchen-1"];
  process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = config.pins["kitchen-2"];
  process.env.BISTRO_ACCESS_PIN_SALON = config.pins.salon;
  process.env.BISTRO_ACCESS_SESSION_SECRET = config.sessionSecret;
  process.env.BISTRO_ACCESS_SESSION_TTL_HOURS = String(config.sessionTtlHours);
  process.env.BISTRO_ORDER_SYNC_PROVIDER_MODE = "mock";

  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe("catalog API route protection", () => {
  it("returns 401 for missing-session GET /api/catalog/mappings", async () => {
    const config = createRuntimeConfig();
    const repository = createCatalogRepositorySpy();
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });

    const response = await handleGetCatalogMappingsRoute(
      createGetRequest("/api/catalog/mappings"),
      {
        catalogAdminProvider: provider,
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
        repository,
      },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toBe("Unauthorized");
    expect(provider.listCatalogItems).not.toHaveBeenCalled();
    expect(repository.listKitchenMappings).not.toHaveBeenCalled();
  });

  it("allows authenticated kitchen-1 GET /api/catalog/mappings", async () => {
    const config = createRuntimeConfig();
    const repository = createCatalogRepositorySpy();
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });

    const response = await handleGetCatalogMappingsRoute(
      createGetRequest(
        "/api/catalog/mappings",
        createCookieHeader(config, "kitchen-1"),
      ),
      {
        catalogAdminProvider: provider,
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
        repository,
      },
    );

    expect(response.status).toBe(200);
    expect(provider.listCatalogItems).toHaveBeenCalledWith({ limit: 500 });
    expect(repository.listKitchens).toHaveBeenCalledTimes(1);
    expect(repository.listKitchenMappings).toHaveBeenCalled();
    expect(repository.listProviderOrders).toHaveBeenCalledTimes(1);
  });

  it("returns 403 for authenticated salon POST /api/catalog/mappings and does not persist mappings or trigger replay", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const syncService = createSyncService();
    const upsertSpy = vi.spyOn(context.repository, "upsertKitchenMapping");
    const beforeMappings = context.repository.listKitchenMappings();

    try {
      const response = await handlePostCatalogMappingRoute(
        createRawJsonRequest(
          "/api/catalog/mappings",
          "{",
          createCookieHeader(config, "salon"),
        ),
        {
          catalogAdminProvider: createCatalogAdminProvider(),
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          repository: context.repository,
          syncService,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(syncService.reconcileConfirmedOrders).not.toHaveBeenCalled();
      expect(context.repository.listKitchenMappings()).toEqual(beforeMappings);
    } finally {
      context.close();
    }
  });

  it("allows authenticated kitchen-2 POST /api/catalog/provider-pull", async () => {
    const config = createRuntimeConfig();
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });
    const repository = {
      listKitchenMappings: vi.fn(() => []),
      upsertProviderCatalogItems: vi.fn(),
    } satisfies Pick<
      CatalogMappingRepository,
      "listKitchenMappings" | "upsertProviderCatalogItems"
    >;

    const response = await handlePostProviderCatalogPullRoute(
      createJsonRequest(
        "/api/catalog/provider-pull",
        {},
        createCookieHeader(config, "kitchen-2"),
      ),
      {
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
        provider,
        repository,
      },
    );

    expect(response.status).toBe(200);
    expect(provider.listCatalogItems).toHaveBeenCalledWith({
      limit: 60,
      updatedSince: expect.any(String),
    });
    expect(repository.listKitchenMappings).toHaveBeenCalledTimes(1);
  });

  it("keeps the exported GET /api/catalog/mappings handler available to kitchens", async () => {
    const config = createRuntimeConfig();
    const restore = setAccessRuntimeEnv(config);

    try {
      const response = await getCatalogMappingsRouteExport(
        createGetRequest(
          "/api/catalog/mappings",
          createCookieHeader(config, "kitchen-1"),
        ),
      );

      expect(response.status).toBe(200);
    } finally {
      restore();
    }
  });

  it("keeps the exported POST /api/catalog/mappings handler behind the auth matrix", async () => {
    const config = createRuntimeConfig();
    const restore = setAccessRuntimeEnv(config);

    try {
      const response = await postCatalogMappingRouteExport(
        createRawJsonRequest(
          "/api/catalog/mappings",
          "{",
          createCookieHeader(config, "salon"),
        ),
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
    } finally {
      restore();
    }
  });

  it("keeps the exported POST /api/catalog/provider-pull handler available to kitchens", async () => {
    const config = createRuntimeConfig();
    const restore = setAccessRuntimeEnv(config);

    try {
      const response = await postProviderCatalogPullRouteExport(
        createJsonRequest(
          "/api/catalog/provider-pull",
          {},
          createCookieHeader(config, "kitchen-2"),
        ),
      );

      expect(response.status).toBe(200);
    } finally {
      restore();
    }
  });
});

describe("catalog API direct handlers", () => {
  it("keeps the catalog mappings read contract reusable behind future privileged auth", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => [
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-new-1",
          providerExternalId: "bolo-de-cenoura",
          name: "Bolo de cenoura",
          updatedAt: "2026-05-13T10:00:00.000Z",
          rawPayload: { id: "catalog-item-new-1" },
        },
      ]),
    });

    try {
      const response = await handleGetCatalogMappings({
        catalogAdminProvider: provider,
        repository: context.repository,
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.providerCatalogStatus).toEqual({
        errorMessage: null,
        fetchedItemCount: 1,
        status: "loaded",
      });
      expect(body.providerExternalIdSupport).toEqual(
        provider.getCatalogExternalIdSupport(),
      );
      expect(body.generatedAt).toEqual(expect.any(String));
      expect(body.metrics.totalMappings).toBeGreaterThan(0);
      expect(provider.listCatalogItems).toHaveBeenCalledWith({ limit: 500 });
    } finally {
      context.close();
    }
  });

  it("returns 400 for invalid JSON on the direct catalog mappings write handler", async () => {
    const response = await handlePostCatalogMapping(
      createRawJsonRequest("/api/catalog/mappings", "{"),
      {
        catalogAdminProvider: createCatalogAdminProvider(),
        repository: createCatalogRepositorySpy(),
        syncService: createSyncService(),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("Invalid JSON body");
  });

  it("keeps the catalog mappings write contract reusable behind future privileged auth", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const syncService = createSyncService();
    const provider = createCatalogAdminProvider();
    const beforeCount = context.repository.listKitchenMappings().length;

    try {
      const response = await handlePostCatalogMapping(
        createJsonRequest("/api/catalog/mappings", {
          kitchenId: "kitchen-2",
          menuItemId: "bolo-de-milho",
          menuItemName: "Bolo de milho",
          providerExternalId: "bolo-de-milho",
        }),
        {
          catalogAdminProvider: provider,
          repository: context.repository,
          syncService,
        },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.mapping).toEqual(
        expect.objectContaining({
          kitchenId: "kitchen-2",
          menuItemId: "bolo-de-milho",
          menuItemName: "Bolo de milho",
          providerExternalId: "bolo-de-milho",
        }),
      );
      expect(body.replay).toEqual(
        expect.objectContaining({
          attemptedCount: 0,
          failedAttempts: 0,
          importedOrders: 0,
        }),
      );
      expect(context.repository.listKitchenMappings()).toHaveLength(beforeCount + 1);
      expect(syncService.reconcileConfirmedOrders).not.toHaveBeenCalled();
    } finally {
      context.close();
    }
  });

  it("returns 400 from the direct catalog mappings write handler when the payload is invalid", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const response = await handlePostCatalogMapping(
        createJsonRequest("/api/catalog/mappings", {
          kitchenId: "kitchen-9",
          menuItemName: "Item invalido",
        }),
        {
          catalogAdminProvider: createCatalogAdminProvider(),
          repository: context.repository,
          syncService: createSyncService(),
        },
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toBe("Invalid kitchenId");
    } finally {
      context.close();
    }
  });

  it("returns the fallback 502 message when the direct catalog mappings write handler receives a non-Error failure", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const provider = createCatalogAdminProvider({
      getCatalogExternalIdSupport: () => ({
        provider: "anota_ai",
        providerLabel: "Anota AI",
        mode: "api_write",
        actionLabel: "Publicar external ID",
        summary: "Permite publicar external IDs pelo provider.",
        helpUrl: null,
        instructions: [],
      }),
      publishExternalId: () => Promise.reject({ reason: "provider exploded" }),
    });

    try {
      const response = await handlePostCatalogMapping(
        createJsonRequest("/api/catalog/mappings", {
          kitchenId: "kitchen-1",
          menuItemId: "item-provider-quebrado",
          menuItemName: "Item provider quebrado",
          providerItemId: "provider-item-1",
          providerExternalId: "item-provider-quebrado",
          publishProviderExternalId: true,
        }),
        {
          catalogAdminProvider: provider,
          repository: context.repository,
          syncService: createSyncService(),
        },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toBe(
        "Falha ao salvar mapping no provider.",
      );
    } finally {
      context.close();
    }
  });

  it("returns 502 from the direct catalog mappings write handler when the provider failure is a regular Error", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const provider = createCatalogAdminProvider({
      getCatalogExternalIdSupport: () => ({
        provider: "anota_ai",
        providerLabel: "Anota AI",
        mode: "api_write",
        actionLabel: "Publicar external ID",
        summary: "Permite publicar external IDs pelo provider.",
        helpUrl: null,
        instructions: [],
      }),
      publishExternalId: async () => {
        throw new Error("provider unavailable");
      },
    });

    try {
      const response = await handlePostCatalogMapping(
        createJsonRequest("/api/catalog/mappings", {
          kitchenId: "kitchen-1",
          menuItemId: "item-provider-indisponivel",
          menuItemName: "Item provider indisponivel",
          providerItemId: "provider-item-2",
          providerExternalId: "item-provider-indisponivel",
          publishProviderExternalId: true,
        }),
        {
          catalogAdminProvider: provider,
          repository: context.repository,
          syncService: createSyncService(),
        },
      );

      expect(response.status).toBe(502);
      expect(await response.json()).toBe("provider unavailable");
    } finally {
      context.close();
    }
  });

  it("returns 400 for invalid provider pull limits without reaching provider work", async () => {
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });
    const repository = {
      listKitchenMappings: vi.fn(() => []),
      upsertProviderCatalogItems: vi.fn(),
    } satisfies Pick<
      CatalogMappingRepository,
      "listKitchenMappings" | "upsertProviderCatalogItems"
    >;

    const response = await handlePostProviderCatalogPull(
      createJsonRequest("/api/catalog/provider-pull", {
        limit: 0,
      }),
      {
        provider,
        repository,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("Invalid limit");
    expect(provider.listCatalogItems).not.toHaveBeenCalled();
    expect(repository.listKitchenMappings).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON on the direct provider pull handler", async () => {
    const response = await handlePostProviderCatalogPull(
      createRawJsonRequest("/api/catalog/provider-pull", "{"),
      {
        provider: createCatalogAdminProvider(),
        repository: {
          listKitchenMappings: vi.fn(() => []),
        },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("Invalid JSON body");
  });

  it("returns 400 for invalid updatedSince values without reaching provider work", async () => {
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });
    const repository = {
      listKitchenMappings: vi.fn(() => []),
      upsertProviderCatalogItems: vi.fn(),
    } satisfies Pick<
      CatalogMappingRepository,
      "listKitchenMappings" | "upsertProviderCatalogItems"
    >;

    const response = await handlePostProviderCatalogPull(
      createJsonRequest("/api/catalog/provider-pull", {
        updatedSince: "   ",
      }),
      {
        provider,
        repository,
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("Invalid updatedSince");
    expect(provider.listCatalogItems).not.toHaveBeenCalled();
    expect(repository.listKitchenMappings).not.toHaveBeenCalled();
  });

  it("keeps the provider pull preview contract reusable behind future privileged auth", async () => {
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => [
        {
          provider: "anota_ai",
          providerItemId: "catalog-item-55",
          providerExternalId: "mini-pudim",
          name: "Mini pudim",
          updatedAt: "2026-05-13T11:00:00.000Z",
          rawPayload: { id: "catalog-item-55" },
        },
      ]),
    });
    const repository = {
      listKitchenMappings: vi.fn(() => []),
      upsertProviderCatalogItems: vi.fn(),
    } satisfies Pick<
      CatalogMappingRepository,
      "listKitchenMappings" | "upsertProviderCatalogItems"
    >;

    const response = await handlePostProviderCatalogPull(
      createJsonRequest("/api/catalog/provider-pull", {
        limit: 5,
        updatedSince: "2026-05-10T00:00:00.000Z",
      }),
      {
        provider,
        repository,
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        catalogItemsScanned: 1,
        limitUsed: 5,
        metrics: {
          pendingMissingExternalIdItems: 0,
          pendingProviderItems: 1,
        },
        provider: "anota_ai",
        pulledAt: expect.any(String),
        updatedSinceUsed: "2026-05-10T00:00:00.000Z",
      }),
    );
    expect(provider.listCatalogItems).toHaveBeenCalledWith({
      limit: 5,
      updatedSince: "2026-05-10T00:00:00.000Z",
    });
    expect(repository.listKitchenMappings).toHaveBeenCalledTimes(1);
  });

  it("uses the default pull window when the direct provider pull handler receives an empty body", async () => {
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => []),
    });
    const repository = {
      listKitchenMappings: vi.fn(() => []),
      upsertProviderCatalogItems: vi.fn(),
    } satisfies Pick<
      CatalogMappingRepository,
      "listKitchenMappings" | "upsertProviderCatalogItems"
    >;

    const response = await handlePostProviderCatalogPull(
      createJsonRequest("/api/catalog/provider-pull", {}),
      {
        provider,
        repository,
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.limitUsed).toBe(60);
    expect(body.updatedSinceUsed).toEqual(expect.any(String));
    expect(provider.listCatalogItems).toHaveBeenCalledWith({
      limit: 60,
      updatedSince: expect.any(String),
    });
  });

  it("surfaces provider pull failures through the direct preview handler", async () => {
    const provider = createCatalogAdminProvider({
      listCatalogItems: vi.fn(async () => {
        throw new TypeError("catalog pull failed");
      }),
    });

    const response = await handlePostProviderCatalogPull(
      createJsonRequest("/api/catalog/provider-pull", {}),
      {
        provider,
        repository: {
          listKitchenMappings: vi.fn(() => []),
          upsertProviderCatalogItems: vi.fn(),
        },
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toBe("catalog pull failed");
  });
});
