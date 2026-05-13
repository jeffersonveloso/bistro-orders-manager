import { expect, test } from "@playwright/test";

import { loginThroughAccess } from "@/e2e/support/access";

test("redirects unauthenticated board access to /access", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/access$/);
});

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

test("redirects a kitchen session away from /salon back to its canonical home", async ({
  page,
}) => {
  await loginThroughAccess(page, {
    areaId: "kitchen-1",
    pin: "1111",
  });

  await page.goto("/salon");

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "Sync board para duas cozinhas" }),
  ).toBeVisible();
});

test("redirects current areas away from /catalog", async ({ page }) => {
  await loginThroughAccess(page, {
    areaId: "salon",
    pin: "3333",
  });

  await page.goto("/catalog");

  await expect(page).toHaveURL(/\/salon$/);
  await expect(page.getByRole("heading", { name: "Salão" })).toBeVisible();
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

test("opening a protected order page without kitchen query canonicalizes to the session kitchen", async ({
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
  await expect(page.getByTestId("focus-kitchen-name")).toContainText(
    "Kitchen 1",
  );
});
