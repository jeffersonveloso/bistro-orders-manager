import { expect, test } from "@playwright/test";

import { createAccessSession } from "@/e2e/support/access";

test("exposes the seeded board and order contract through protected APIs", async ({
  request,
}) => {
  const { cookieHeader } = await createAccessSession(request, {
    areaId: "kitchen-2",
    pin: "2222",
  });
  const boardResponse = await request.get("/api/board", {
    headers: {
      cookie: cookieHeader,
    },
  });

  expect(boardResponse.ok()).toBe(true);
  const board = await boardResponse.json();

  expect(board.kitchens).toHaveLength(2);
  expect(Array.isArray(board.salonSummary)).toBe(true);
  expect(typeof board.generatedAt).toBe("string");

  const order102 = board.salonSummary.find(
    (order: { orderId: string }) => order.orderId === "order_anota-102",
  );
  const order103 = board.salonSummary.find(
    (order: { orderId: string }) => order.orderId === "order_anota-103",
  );
  const order104 = board.salonSummary.find(
    (order: { orderId: string }) => order.orderId === "order_anota-104",
  );

  expect(order102?.orderStatus).toBe("Parcialmente pronto");
  expect(order103?.orderStatus).toBe("Pronto para servir");
  expect(order104?.orderStatus).toBe("Em andamento");

  const detailResponse = await request.get(
    "/api/orders/order_anota-102?kitchen=kitchen-2",
    {
      headers: {
        cookie: cookieHeader,
      },
    },
  );

  expect(detailResponse.ok()).toBe(true);
  const detail = await detailResponse.json();

  expect(detail.focusKitchenId).toBe("kitchen-2");
  expect(detail.focusTicketStatus).toBe("in_preparation");
  expect(detail.otherKitchen?.statusKey).toBe("ready");
  expect(detail.orderStatusKey).toBe("partially_ready");
});
