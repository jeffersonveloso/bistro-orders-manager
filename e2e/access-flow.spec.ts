import { expect, test } from "@playwright/test";

import { loginThroughAccess } from "@/e2e/support/access";

test("revisiting /access with an existing kitchen session redirects to /", async ({
  page,
}) => {
  await loginThroughAccess(page, {
    areaId: "kitchen-1",
    pin: "1111",
  });

  await expect(page).toHaveURL(/\/$/);

  await page.goto("/access");

  await expect(page).toHaveURL(/\/$/);
});

test("revisiting /access with an existing salao session redirects to /salon", async ({
  page,
}) => {
  await loginThroughAccess(page, {
    areaId: "salon",
    pin: "3333",
  });

  await expect(page).toHaveURL(/\/salon$/);

  await page.goto("/access");

  await expect(page).toHaveURL(/\/salon$/);
});

test("logging in with an order-detail next target normalizes the kitchen focus", async ({
  page,
}) => {
  await loginThroughAccess(page, {
    areaId: "kitchen-2",
    next: "/orders/order_anota-101",
    pin: "2222",
  });

  await expect(page).toHaveURL(
    /\/orders\/order_anota-101\?kitchen=kitchen-2$/,
  );
  await expect(page.getByTestId("focus-kitchen-name")).toContainText(
    "Kitchen 2",
  );
});
