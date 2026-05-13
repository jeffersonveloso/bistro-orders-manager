import { expect, test } from "@playwright/test";

import { loginThroughAccess } from "@/e2e/support/access";

test("loads the dashboard and blocks cross-area shortcuts through canonical redirects", async ({
  page,
}) => {
  await loginThroughAccess(page, {
    areaId: "kitchen-1",
    pin: "1111",
  });

  await expect(page).toHaveURL(/\/$/);

  await expect(
    page.getByRole("heading", { name: "Sync board para duas cozinhas" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchen 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchen 2" })).toBeVisible();
  await expect(page.getByText("Pedidos ativos")).toBeVisible();
  await expect(page.getByText("Parcialmente prontos")).toBeVisible();
  await expect(page.getByText("Prontos para servir")).toBeVisible();
  await expect(page.getByTestId("board-sync-alerts")).toBeVisible();
  await expect(page.getByTestId("board-sync-alerts")).toContainText(
    "Falha de sincronização",
  );
  await expect(
    page.getByTestId("ticket-sync-marker-order_anota-101__kitchen-1"),
  ).toContainText("Mudança externa");
  await expect(page.locator('a[href="/salon"]')).toHaveCount(0);
  await expect(page.locator('a[href="/catalog"]')).toHaveCount(0);

  await page.getByTestId("ticket-card-order_anota-101__kitchen-1").click();

  await expect(page).toHaveURL(
    /\/orders\/order_anota-101\?kitchen=kitchen-1$/,
  );
  await expect(page.getByTestId("focus-kitchen-name")).toHaveText("Kitchen 1");
  await expect(page.getByTestId("other-kitchen-panel")).toContainText(
    "Kitchen 2",
  );
});
