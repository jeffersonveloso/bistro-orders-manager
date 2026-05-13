import { describe, expect, it } from "vitest";

import {
  FetchJsonError,
  getProtectedRouteFeedback,
} from "@/src/lib/fetch-json";

describe("fetchJson protected-route feedback", () => {
  it("returns an actionable re-entry fallback for expired protected requests", () => {
    const feedback = getProtectedRouteFeedback(
      new FetchJsonError({
        body: "Unauthorized",
        message: "Unauthorized",
        status: 401,
        statusText: "Unauthorized",
      }),
    );

    expect(feedback).toEqual({
      actionHref: "/access?reason=expired",
      actionLabel: "Entrar novamente",
      description:
        "A sessao da area expirou ou foi perdida neste dispositivo. Informe o PIN novamente para retomar a operacao.",
      title: "Sessao expirada",
    });
  });

  it("returns an actionable area-selection fallback for forbidden protected requests", () => {
    const feedback = getProtectedRouteFeedback(
      new FetchJsonError({
        body: "Forbidden",
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      }),
    );

    expect(feedback).toEqual({
      actionHref: "/access",
      actionLabel: "Escolher area",
      description:
        "Esta superficie nao esta liberada para a area atual. Volte pela tela de acesso para continuar na area correta.",
      title: "Area sem permissao",
    });
  });
});
