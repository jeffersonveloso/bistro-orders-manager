import { describe, expect, it } from "vitest";

import { handlePostAccessLogout } from "@/app/api/access/logout/route";

describe("POST /api/access/logout", () => {
  it("clears the session cookie deterministically and returns 204", async () => {
    const response = handlePostAccessLogout(
      new Request("http://127.0.0.1:3001/api/access/logout", {
        method: "POST",
      }),
      {
        env: {
          NODE_ENV: "production",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain(
      "bistro_area_session=",
    );
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(response.headers.get("Set-Cookie")).not.toContain("Secure");
  });

  it("keeps secure cookie clearing on HTTPS deployments", async () => {
    const response = handlePostAccessLogout(
      new Request("https://bistro.example.com/api/access/logout", {
        method: "POST",
      }),
      {
        env: {
          NODE_ENV: "production",
        },
      },
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
  });
});
