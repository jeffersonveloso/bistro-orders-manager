import { describe, expect, it, vi } from "vitest";

import { handleGetBoard } from "@/app/api/board/route";
import { handleGetOrderDetail } from "@/app/api/orders/[orderId]/route";
import { handleGetSalon } from "@/app/api/salon/route";
import type {
  DashboardData,
  OrderDetailData,
  SalonData,
} from "@/src/application/production-service";
import type { AreaSession } from "@/src/domain/area-access";
import type { AreaAccessRuntimeConfig } from "@/src/infrastructure/area-session";
import { signAreaSession } from "@/src/infrastructure/area-session";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

function createRuntimeConfig(): AreaAccessRuntimeConfig {
  return {
    cookieName: "bistro_area_session",
    elevatedPins: {},
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
  overrides: Partial<AreaSession> = {},
) {
  return `${config.cookieName}=${signAreaSession(
    {
      allowedAreaIds: [areaId],
      areaId,
      expiresAt: "2099-12-31T23:59:59.000Z",
      issuedAt: "2026-05-13T00:00:00.000Z",
      role: "station",
      version: 1,
      ...overrides,
    },
    config,
  )}`;
}

function createRequest(
  path: string,
  cookieHeader?: string,
) {
  return new Request(`http://localhost${path}`, {
    headers: cookieHeader
      ? {
          cookie: cookieHeader,
        }
      : undefined,
  });
}

describe("protected production read routes", () => {
  it("returns only the salão contract shape from GET /api/salon", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const response = await handleGetSalon(
        createRequest("/api/salon", createCookieHeader(config, "salon")),
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );
      const body = (await response.json()) as SalonData & Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body).toEqual(
        expect.objectContaining({
          generatedAt: expect.any(String),
          metrics: expect.objectContaining({
            activeOrders: expect.any(Number),
            partiallyReadyOrders: expect.any(Number),
            readyToServeOrders: expect.any(Number),
          }),
          openSyncExceptions: expect.any(Number),
          summary: expect.any(Array),
        }),
      );
      expect(body.kitchens).toBeUndefined();
      expect(body.syncAlerts).toBeUndefined();
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      context.close();
    }
  });

  it("derives the focus kitchen from the authenticated area when GET /api/orders/[orderId] omits kitchen", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();

    try {
      const response = await handleGetOrderDetail(
        createRequest(
          "/api/orders/order_anota-102",
          createCookieHeader(config, "kitchen-2"),
        ),
        { orderId: "order_anota-102" },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh: vi.fn(async () => {}),
          repository: context.repository,
        },
      );
      const body = (await response.json()) as OrderDetailData;

      expect(response.status).toBe(200);
      expect(body.focusKitchenId).toBe("kitchen-2");
    } finally {
      context.close();
    }
  });

  it("returns 403 for GET /api/orders/[orderId]?kitchen=kitchen-2 from a kitchen-1 session before refresh runs", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const response = await handleGetOrderDetail(
        createRequest(
          "/api/orders/order_anota-102?kitchen=kitchen-2",
          createCookieHeader(config, "kitchen-1"),
        ),
        { orderId: "order_anota-102" },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      context.close();
    }
  });

  it("allows an elevated kitchen session to read the other kitchen focus", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();

    try {
      const response = await handleGetOrderDetail(
        createRequest(
          "/api/orders/order_anota-102?kitchen=kitchen-2",
          createCookieHeader(config, "kitchen-1", {
            allowedAreaIds: ["kitchen-1", "kitchen-2", "salon"],
            role: "manager",
          }),
        ),
        { orderId: "order_anota-102" },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh: vi.fn(async () => {}),
          repository: context.repository,
        },
      );
      const body = (await response.json()) as OrderDetailData;

      expect(response.status).toBe(200);
      expect(body.focusKitchenId).toBe("kitchen-2");
    } finally {
      context.close();
    }
  });

  it("returns 403 for GET /api/board from a salão session", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const response = await handleGetBoard(
        createRequest("/api/board", createCookieHeader(config, "salon")),
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      context.close();
    }
  });

  it("allows an elevated kitchen session to read the salão surface", async () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();

    try {
      const response = await handleGetSalon(
        createRequest(
          "/api/salon",
          createCookieHeader(config, "kitchen-1", {
            allowedAreaIds: ["kitchen-1", "kitchen-2", "salon"],
            role: "manager",
          }),
        ),
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh: vi.fn(async () => {}),
          repository: context.repository,
        },
      );

      expect(response.status).toBe(200);
      expect((await response.json()) as SalonData).toEqual(
        expect.objectContaining({
          summary: expect.any(Array),
        }),
      );
    } finally {
      context.close();
    }
  });

  it("returns 401 for missing-session GET /api/board before refresh runs", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    try {
      const response = await handleGetBoard(createRequest("/api/board"), {
        config,
        now: new Date("2026-05-13T12:00:00.000Z"),
        refresh,
        repository: context.repository,
      });

      expect(response.status).toBe(401);
      expect(await response.json()).toBe("Unauthorized");
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      context.close();
    }
  });

  it("keeps authorized kitchen reads exposing tickets and sync exception data", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const refresh = vi.fn(async () => {});

    context.repository.openOrRefreshException({
      provider: "anota_ai",
      kind: "changed_externally",
      orderId: "order_anota-101",
      externalOrderId: "anota-101",
      summary: "Pedido Pedido 101 divergiu externamente após a importação",
      details: {
        diffs: [{ type: "quantity_changed" }],
      },
    });

    try {
      const boardResponse = await handleGetBoard(
        createRequest("/api/board", createCookieHeader(config, "kitchen-1")),
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );
      const board = (await boardResponse.json()) as DashboardData;
      const detailResponse = await handleGetOrderDetail(
        createRequest(
          "/api/orders/order_anota-101",
          createCookieHeader(config, "kitchen-1"),
        ),
        { orderId: "order_anota-101" },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          refresh,
          repository: context.repository,
        },
      );
      const detail = (await detailResponse.json()) as OrderDetailData;

      expect(boardResponse.status).toBe(200);
      expect(detailResponse.status).toBe(200);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(board.syncAlerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: "order_anota-101",
            label: "Mudança externa",
          }),
        ]),
      );
      expect(
        board.kitchens
          .find((kitchen) => kitchen.id === "kitchen-1")
          ?.columns.flatMap((column) => column.tickets)
          .find((ticket) => ticket.orderId === "order_anota-101"),
      ).toEqual(
        expect.objectContaining({
          hasOpenSyncException: true,
          syncExceptionLabel: "Mudança externa",
        }),
      );
      expect(detail).toEqual(
        expect.objectContaining({
          focusKitchenId: "kitchen-1",
          syncException: expect.objectContaining({
            label: "Mudança externa",
          }),
        }),
      );
    } finally {
      context.close();
    }
  });
});
