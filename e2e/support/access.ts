import type { Page } from "@playwright/test";

export async function loginThroughAccess(
  page: Page,
  {
    areaId,
    next,
    pin,
  }: {
    areaId: "kitchen-1" | "kitchen-2" | "salon";
    next?: string;
    pin: string;
  },
) {
  const target = next
    ? `/access?next=${encodeURIComponent(next)}`
    : "/access";

  await page.goto(target);
  await page.getByTestId(`access-area-${areaId}`).click();
  await page.getByTestId("access-pin-input").fill(pin);
  await page.getByTestId("access-submit").click();
}
