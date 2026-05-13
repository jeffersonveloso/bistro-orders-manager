import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getDashboardData } from "@/src/application/production-service";
import { DashboardClient } from "@/src/components/kds/dashboard-client";
import {
  getDashboardInvalidationKeys,
  getSalonQueryOptions,
} from "@/src/components/kds/production-client-contracts";
import { createProductionTestContext } from "@/src/infrastructure/sqlite";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("production client contracts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches salão reads from /api/salon", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          generatedAt: "2026-05-13T12:00:00.000Z",
          metrics: {
            activeOrders: 1,
            partiallyReadyOrders: 0,
            readyToServeOrders: 0,
          },
          openSyncExceptions: 0,
          summary: [],
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await getSalonQueryOptions().queryFn();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/salon",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("keeps order-detail invalidation aligned with protected board and order keys", () => {
    expect(getDashboardInvalidationKeys("order_anota-101", "kitchen-1")).toEqual([
      ["board"],
      ["order", "order_anota-101", "kitchen-1"],
    ]);
  });

  it("does not render shortcuts to deferred or wrong-area surfaces on the dashboard", () => {
    const context = createProductionTestContext({
      applyDemoScenarios: true,
      importProviderOrders: true,
    });

    try {
      const markup = renderToStaticMarkup(
        createElement(
          QueryClientProvider,
          {
            client: new QueryClient(),
          },
          createElement(DashboardClient, {
            activeKitchenId: "kitchen-1",
            initialData: getDashboardData(context.repository),
          }),
        ),
      );

      expect(markup).not.toContain("/catalog");
      expect(markup).not.toContain("/salon");
    } finally {
      context.close();
    }
  });
});
