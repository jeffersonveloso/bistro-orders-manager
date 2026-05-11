import { expect, test } from "@playwright/test";

test("acknowledges a salon exception without clearing unresolved visibility", async ({
  page,
}) => {
  await page.goto("/salon");

  const exceptionCard = page.getByTestId("salon-sync-exception-order_anota-101");
  const acknowledgeButton = page.getByTestId(
    "salon-acknowledge-order_anota-101",
  );

  await expect(exceptionCard).toContainText("Mudança externa");
  await expect(acknowledgeButton).toBeVisible();

  const responsePromise = page.waitForResponse((response) => {
    return (
      response.request().method() === "POST" &&
      response
        .url()
        .includes(
          "/api/orders/order_anota-101/sync-exceptions/",
        ) &&
      response.url().endsWith("/acknowledge")
    );
  });

  await acknowledgeButton.click();

  const response = await responsePromise;
  expect(response.status()).toBe(200);

  await expect(exceptionCard).toContainText("Mudança externa");
  await expect(exceptionCard).toContainText("Salão ciente");
  await expect(acknowledgeButton).toHaveCount(0);
});
