import { expect, test } from "@playwright/test";

import { loginThroughAccess } from "@/e2e/support/access";

test("acknowledges a salon exception without clearing unresolved visibility", async ({
  page,
}) => {
  const salonLoadPromise = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      response.url().endsWith("/api/salon")
    );
  });

  await loginThroughAccess(page, {
    areaId: "salon",
    pin: "3333",
  });

  const salonLoadResponse = await salonLoadPromise;
  expect(salonLoadResponse.status()).toBe(200);

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
  const refreshPromise = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      response.url().endsWith("/api/salon")
    );
  });

  await acknowledgeButton.click();

  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const refreshResponse = await refreshPromise;
  expect(refreshResponse.status()).toBe(200);

  await expect(exceptionCard).toContainText("Mudança externa");
  await expect(exceptionCard).toContainText("Salão ciente");
  await expect(acknowledgeButton).toHaveCount(0);
});
