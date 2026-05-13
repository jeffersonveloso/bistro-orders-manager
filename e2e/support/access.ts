import type { APIRequestContext, Page } from "@playwright/test";

export async function createAccessSession(
  request: APIRequestContext,
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
  const response = await request.post("/api/access/session", {
    data: {
      areaId,
      next,
      pin,
    },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create access session: ${response.status()}`);
  }

  const cookieHeader = response.headers()["set-cookie"]?.split(";")[0];

  if (!cookieHeader) {
    throw new Error("Missing access session cookie");
  }

  return {
    cookieHeader,
    payload: await response.json(),
  };
}

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
