import { describe, expect, it } from "vitest";

import { handlePostAccessLogout } from "@/app/api/access/logout/route";

describe("POST /api/access/logout", () => {
  it("clears the session cookie deterministically and returns 204", async () => {
    const response = handlePostAccessLogout({
      env: {
        NODE_ENV: "development",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain(
      "bistro_area_session=",
    );
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });
});
