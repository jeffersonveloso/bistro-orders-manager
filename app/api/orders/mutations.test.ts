import { describe, expect, it, vi } from "vitest";

import {
  handlePatchOrderItem,
  handlePatchOrderItemRoute,
} from "@/app/api/orders/[orderId]/items/[itemId]/route";
import {
  handlePatchKitchenTicket,
  handlePatchKitchenTicketRoute,
} from "@/app/api/orders/[orderId]/tickets/[kitchenId]/route";
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
      expiresAt: "2026-05-13T16:00:00.000Z",
      issuedAt: "2026-05-13T00:00:00.000Z",
      version: 1,
    },
    config,
  )}`;
}

function createPatchRequest(
  path: string,
  body: Record<string, unknown>,
  cookieHeader?: string,
) {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

function readOrderItemRow(
  context: ReturnType<typeof createProductionTestContext>,
  itemId: string,
) {
  return context.database
    .prepare(
      `
        SELECT status as status, updated_at as updatedAt
        FROM order_items
        WHERE id = ?
      `,
    )
    .get(itemId) as
    | {
        status: string;
        updatedAt: string;
      }
    | undefined;
}

describe("order mutation API handlers", () => {
  it("updates a single item status", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const response = handlePatchOrderItem(context.repository, {
        itemId: "order_anota-101__101-1",
        orderId: "order_anota-101",
        status: "in_preparation",
      });

      expect(response.status).toBe(200);
      expect(
        context.repository
          .getOrderAggregate("order_anota-101")
          ?.items.find((item) => item.id === "order_anota-101__101-1")?.status,
      ).toBe("in_preparation");
    } finally {
      context.close();
    }
  });

  it("returns 400 for invalid item status payloads", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const response = handlePatchOrderItem(context.repository, {
        itemId: "order_anota-101__101-1",
        orderId: "order_anota-101",
        status: "done",
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toBe("Invalid status");
    } finally {
      context.close();
    }
  });

  it("starts and completes a kitchen ticket through the handler flow", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const startResponse = handlePatchKitchenTicket(context.repository, {
        action: "start",
        kitchenId: "kitchen-1",
        orderId: "order_anota-101",
      });
      expect(startResponse.status).toBe(200);

      const startedItems =
        context.repository
          .getOrderAggregate("order_anota-101")
          ?.items.filter((item) => item.kitchenId === "kitchen-1") ?? [];
      expect(startedItems.every((item) => item.status === "in_preparation")).toBe(
        true,
      );

      const completeResponse = handlePatchKitchenTicket(context.repository, {
        action: "complete",
        kitchenId: "kitchen-1",
        orderId: "order_anota-101",
      });
      expect(completeResponse.status).toBe(200);

      const completedItems =
        context.repository
          .getOrderAggregate("order_anota-101")
          ?.items.filter((item) => item.kitchenId === "kitchen-1") ?? [];
      expect(completedItems.every((item) => item.status === "ready")).toBe(true);
    } finally {
      context.close();
    }
  });

  it("returns 400 for invalid kitchen ids and actions", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });

    try {
      const invalidKitchenResponse = handlePatchKitchenTicket(context.repository, {
        action: "start",
        kitchenId: "kitchen-9",
        orderId: "order_anota-101",
      });
      expect(invalidKitchenResponse.status).toBe(400);
      expect(await invalidKitchenResponse.json()).toBe("Invalid kitchen");

      const invalidActionResponse = handlePatchKitchenTicket(context.repository, {
        action: "ship",
        kitchenId: "kitchen-1",
        orderId: "order_anota-101",
      });
      expect(invalidActionResponse.status).toBe(400);
      expect(await invalidActionResponse.json()).toBe("Invalid action");
    } finally {
      context.close();
    }
  });
});

describe("protected order mutation routes", () => {
  it("returns 403 for PATCH /api/orders/[orderId]/tickets/kitchen-2 from a kitchen-1 session before any ticket mutation runs", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const orderId = "order_anota-101";
    const beforeStatuses =
      context.repository
        .getOrderAggregate(orderId)
        ?.items.filter((item) => item.kitchenId === "kitchen-2")
        .map((item) => ({ id: item.id, status: item.status })) ?? [];
    const startSpy = vi.spyOn(context.repository, "startKitchenTicket");

    try {
      const response = await handlePatchKitchenTicketRoute(
        createPatchRequest(
          `/api/orders/${orderId}/tickets/kitchen-2`,
          {
            action: "start",
          },
          createCookieHeader(config, "kitchen-1"),
        ),
        {
          kitchenId: "kitchen-2",
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          repository: context.repository,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(startSpy).not.toHaveBeenCalled();
      expect(
        context.repository
          .getOrderAggregate(orderId)
          ?.items.filter((item) => item.kitchenId === "kitchen-2")
          .map((item) => ({ id: item.id, status: item.status })),
      ).toEqual(beforeStatuses);
    } finally {
      context.close();
    }
  });

  it("returns 403 for PATCH /api/orders/[orderId]/items/[itemId] when the authenticated kitchen does not own the item", async () => {
    const context = createProductionTestContext({
      importProviderOrders: true,
    });
    const config = createRuntimeConfig();
    const orderId = "order_anota-101";
    const itemId = "order_anota-101__101-3";
    const beforeRow = readOrderItemRow(context, itemId);
    const updateSpy = vi.spyOn(context.repository, "updateItemStatus");

    try {
      const response = await handlePatchOrderItemRoute(
        createPatchRequest(
          `/api/orders/${orderId}/items/${itemId}`,
          {
            status: "in_preparation",
          },
          createCookieHeader(config, "kitchen-1"),
        ),
        {
          itemId,
          orderId,
        },
        {
          config,
          now: new Date("2026-05-13T12:00:00.000Z"),
          repository: context.repository,
        },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toBe("Forbidden");
      expect(updateSpy).not.toHaveBeenCalled();
      expect(readOrderItemRow(context, itemId)).toEqual(beforeRow);
    } finally {
      context.close();
    }
  });

  it.each([
    {
      cookieHeader: undefined,
      label: "missing session",
    },
    {
      cookieHeader: "bistro_area_session=invalid",
      label: "invalid session",
    },
  ])(
    "returns 401 for ticket and item mutations with a $label",
    async ({ cookieHeader }) => {
      const context = createProductionTestContext({
        importProviderOrders: true,
      });
      const config = createRuntimeConfig();
      const startSpy = vi.spyOn(context.repository, "startKitchenTicket");
      const updateSpy = vi.spyOn(context.repository, "updateItemStatus");

      try {
        const ticketResponse = await handlePatchKitchenTicketRoute(
          createPatchRequest(
            "/api/orders/order_anota-101/tickets/kitchen-1",
            {
              action: "start",
            },
            cookieHeader,
          ),
          {
            kitchenId: "kitchen-1",
            orderId: "order_anota-101",
          },
          {
            config,
            now: new Date("2026-05-13T12:00:00.000Z"),
            repository: context.repository,
          },
        );
        const itemResponse = await handlePatchOrderItemRoute(
          createPatchRequest(
            "/api/orders/order_anota-101/items/order_anota-101__101-1",
            {
              status: "in_preparation",
            },
            cookieHeader,
          ),
          {
            itemId: "order_anota-101__101-1",
            orderId: "order_anota-101",
          },
          {
            config,
            now: new Date("2026-05-13T12:00:00.000Z"),
            repository: context.repository,
          },
        );

        expect(ticketResponse.status).toBe(401);
        expect(await ticketResponse.json()).toBe("Unauthorized");
        expect(itemResponse.status).toBe(401);
        expect(await itemResponse.json()).toBe("Unauthorized");
        expect(startSpy).not.toHaveBeenCalled();
        expect(updateSpy).not.toHaveBeenCalled();
      } finally {
        context.close();
      }
    },
  );
});
