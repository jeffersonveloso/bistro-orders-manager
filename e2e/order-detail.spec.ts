import { expect, test } from "@playwright/test";

import { loginThroughAccess } from "@/e2e/support/access";

test.describe("order detail flows", () => {
  test("keeps cross-kitchen visibility while mutating a mixed order item", async ({
    page,
  }) => {
    await loginThroughAccess(page, {
      areaId: "kitchen-1",
      pin: "1111",
    });

    await page.goto("/orders/order_anota-101");

    await expect(page).toHaveURL(
      /\/orders\/order_anota-101\?kitchen=kitchen-1$/,
    );

    await expect(page.getByRole("heading", { name: "Mesa 4" })).toBeVisible();
    await expect(page.getByTestId("focus-kitchen-name")).toHaveText("Kitchen 1");
    await expect(page.getByTestId("sync-exception-banner")).toContainText(
      "Mudança externa",
    );
    await expect(page.getByTestId("sync-trail-panel")).toContainText(
      "Trilha mínima de sync",
    );
    await expect(page.getByTestId("sync-trail-panel")).toContainText(
      "Mudança externa",
    );

    const otherKitchenPanel = page.getByTestId("other-kitchen-panel");
    await expect(page.getByTestId("other-kitchen-name")).toHaveText("Kitchen 2");
    await expect(otherKitchenPanel).toContainText("Croissant");

    const itemCard = page.getByTestId("focus-item-order_anota-101__101-1");
    await expect(itemCard).toContainText("Novo");

    await itemCard.getByTestId("item-action-order_anota-101__101-1").click();
    await expect(itemCard).toContainText("Em preparo");

    await itemCard.getByTestId("item-action-order_anota-101__101-1").click();
    await expect(itemCard).toContainText("Pronto");
  });

  test("shows no cross-kitchen dependency for a single-kitchen order", async ({
    page,
  }) => {
    await loginThroughAccess(page, {
      areaId: "kitchen-1",
      pin: "1111",
    });

    await page.goto("/orders/order_anota-105?kitchen=kitchen-1");

    await expect(page.getByRole("heading", { name: "Mesa 2" })).toBeVisible();

    const otherKitchenPanel = page.getByTestId("other-kitchen-panel");
    await expect(otherKitchenPanel).toContainText("Sem outra cozinha");
    await expect(otherKitchenPanel).toContainText(
      "Este pedido pertence somente a esta cozinha.",
    );

    const itemCard = page.getByTestId("focus-item-order_anota-105__105-1");
    await itemCard.getByTestId("item-action-order_anota-105__105-1").click();
    await expect(itemCard).toContainText("Em preparo");
  });

  test("canonicalizes a wrong-kitchen detail URL back to the authorized kitchen", async ({
    page,
  }) => {
    await loginThroughAccess(page, {
      areaId: "kitchen-1",
      pin: "1111",
    });

    await page.goto("/orders/order_anota-101?kitchen=kitchen-2");

    await expect(page).toHaveURL(
      /\/orders\/order_anota-101\?kitchen=kitchen-1$/,
    );
    await expect(page.getByTestId("focus-kitchen-name")).toHaveText("Kitchen 1");
    await expect(page.getByTestId("other-kitchen-name")).toHaveText("Kitchen 2");
  });
});
