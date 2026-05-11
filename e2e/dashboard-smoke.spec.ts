import { expect, test } from "@playwright/test";

test("loads the dashboard and reaches the salon view", async ({ page }) => {
  await page.goto("/");

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

  await page.getByTestId("open-salon-view").click();

  await expect(page).toHaveURL(/\/salon$/);
  await expect(page.getByRole("heading", { name: "Salão" })).toBeVisible();
  await expect(page.getByTestId("salon-order-order_anota-103")).toContainText(
    "Pronto para entregar",
  );
  await expect(
    page.getByTestId("salon-sync-exception-order_anota-101"),
  ).toContainText("Mudança externa");
});
