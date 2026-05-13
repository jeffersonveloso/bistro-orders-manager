import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { areaAccessCookieName, signAreaSession } from "@/src/infrastructure/area-session";

const originalEnv = { ...process.env };

const { cookiesMock, redirectMock } = vi.hoisted(() => {
  return {
    cookiesMock: vi.fn(),
    redirectMock: vi.fn((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    }),
  };
});

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/src/components/access/access-entry-form", () => ({
  AccessEntryForm: () => null,
}));

describe("/access page", () => {
  beforeEach(() => {
    vi.resetModules();
    cookiesMock.mockReset();
    redirectMock.mockClear();
    redirectMock.mockImplementation((target: string) => {
      throw new Error(`NEXT_REDIRECT:${target}`);
    });
    process.env.BISTRO_ACCESS_PIN_KITCHEN_1 = "1111";
    process.env.BISTRO_ACCESS_PIN_KITCHEN_2 = "2222";
    process.env.BISTRO_ACCESS_PIN_SALON = "3333";
    process.env.BISTRO_ACCESS_SESSION_SECRET = "page-secret";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("redirects an existing kitchen session to the kitchen board", async () => {
    cookiesMock.mockResolvedValue({
      get(name: string) {
        if (name !== areaAccessCookieName) {
          return undefined;
        }

        return {
          value: signAreaSession(
            {
              areaId: "kitchen-1",
              expiresAt: "2099-05-13T16:00:00.000Z",
              issuedAt: "2099-05-13T00:00:00.000Z",
              version: 1,
            },
            {
              sessionSecret: "page-secret",
            },
          ),
        };
      },
    });

    const { default: AccessPage } = await import("@/app/access/page");

    await expect(
      AccessPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("redirects an existing salao session to /salon", async () => {
    cookiesMock.mockResolvedValue({
      get(name: string) {
        if (name !== areaAccessCookieName) {
          return undefined;
        }

        return {
          value: signAreaSession(
            {
              areaId: "salon",
              expiresAt: "2099-05-13T16:00:00.000Z",
              issuedAt: "2099-05-13T00:00:00.000Z",
              version: 1,
            },
            {
              sessionSecret: "page-secret",
            },
          ),
        };
      },
    });

    const { default: AccessPage } = await import("@/app/access/page");

    await expect(
      AccessPage({
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/salon");
  });

  it("keeps the access screen available in switch mode for an active session", async () => {
    cookiesMock.mockResolvedValue({
      get(name: string) {
        if (name !== areaAccessCookieName) {
          return undefined;
        }

        return {
          value: signAreaSession(
            {
              areaId: "kitchen-1",
              expiresAt: "2099-05-13T16:00:00.000Z",
              issuedAt: "2099-05-13T00:00:00.000Z",
              version: 1,
            },
            {
              sessionSecret: "page-secret",
            },
          ),
        };
      },
    });

    const { default: AccessPage } = await import("@/app/access/page");
    const result = (await AccessPage({
      searchParams: Promise.resolve({ mode: "switch" }),
    })) as {
      props: {
        initialNotice?: {
          message: string;
          tone: string;
        };
      };
    };

    expect(redirectMock).not.toHaveBeenCalled();
    expect(result.props.initialNotice).toEqual({
      message:
        "Modo de troca de area ativo. Escolha a proxima area e informe o PIN para continuar.",
      tone: "info",
    });
  });
});
