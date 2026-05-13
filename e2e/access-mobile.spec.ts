import { expect, test } from "@playwright/test";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
});

test("allows selecting an area and logging in through touch on mobile", async ({
  page,
}) => {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/access");

  await page.getByTestId("access-area-salon").tap();
  await expect(
    page.locator('input[name="areaId"][value="salon"]'),
  ).toBeChecked();

  await page.getByTestId("access-pin-input").tap();
  await page.getByTestId("access-pin-input").fill("3333");
  await expect(page.getByTestId("access-submit")).toBeEnabled();

  await page.getByTestId("access-submit").tap();
  await expect(page).toHaveURL(/\/salon$/);
  await expect
    .poll(async () => {
      const cookies = await page.context().cookies();
      return cookies.some((cookie) => cookie.name === "bistro_area_session");
    })
    .toBe(true);
  expect(pageErrors).toEqual([]);
});
