import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/access/enter/route";

const originalEnv = { ...process.env };

function createFormRequest(
  body: Record<string, string>,
  url = "http://localhost/access/enter",
) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(body)) {
    formData.set(key, value);
  }

  return new Request(url, {
    method: "POST",
    body: formData,
  });
}

describe("POST /access/enter", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = "1111";
    process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = "2222";
    process.env.BISTRO_ACCESS_PIN_SALON = "3333";
    process.env.BISTRO_ACCESS_SESSION_SECRET = "form-route-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects successful native form logins to the target area", async () => {
    const response = await POST(
      createFormRequest({
        areaId: "salon",
        pin: "3333",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
    expect(await response.text()).toContain("http://localhost/salon");
  });

  it("redirects invalid PIN attempts back to /access preserving the area", async () => {
    const response = await POST(
      createFormRequest({
        areaId: "salon",
        next: "/salon",
        pin: "9999",
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/access?area=salon&next=%2Fsalon&reason=invalid_pin",
    );
  });

  it("keeps secure cookies enabled for HTTPS form submissions", async () => {
    const response = await POST(
      createFormRequest(
        {
          areaId: "salon",
          pin: "3333",
        },
        "https://bistro.example.com/access/enter",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(await response.text()).toContain("https://bistro.example.com/salon");
  });
});
