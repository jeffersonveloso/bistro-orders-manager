export interface ProtectedRouteFeedback {
  actionHref: string;
  actionLabel: string;
  description: string;
  title: string;
}

export class FetchJsonError extends Error {
  readonly body: unknown;
  readonly status: number;
  readonly statusText: string;

  constructor({
    body,
    message,
    status,
    statusText,
  }: {
    body: unknown;
    message: string;
    status: number;
    statusText: string;
  }) {
    super(message);
    this.name = "FetchJsonError";
    this.body = body;
    this.status = status;
    this.statusText = statusText;
  }
}

export function isFetchJsonError(error: unknown): error is FetchJsonError {
  return error instanceof FetchJsonError;
}

export function getProtectedRouteFeedback(
  error: unknown,
): ProtectedRouteFeedback | null {
  if (!isFetchJsonError(error)) {
    return null;
  }

  if (error.status === 401) {
    return {
      actionHref: "/access?reason=expired",
      actionLabel: "Entrar novamente",
      description:
        "A sessao da area expirou ou foi perdida neste dispositivo. Informe o PIN novamente para retomar a operacao.",
      title: "Sessao expirada",
    };
  }

  if (error.status === 403) {
    return {
      actionHref: "/access",
      actionLabel: "Escolher area",
      description:
        "Esta superficie nao esta liberada para a area atual. Volte pela tela de acesso para continuar na area correta.",
      title: "Area sem permissao",
    };
  }

  return null;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
  });
  const body = await readResponseBody(response);

  if (!response.ok) {
    throw new FetchJsonError({
      body,
      message: resolveErrorMessage(body, response.status),
      status: response.status,
      statusText: response.statusText,
    });
  }

  return body as T;
}

async function readResponseBody(response: Response) {
  if (response.status === 204) {
    return undefined;
  }

  const text = await response.text();

  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function resolveErrorMessage(body: unknown, status: number) {
  if (typeof body === "string" && body.trim().length > 0) {
    return body.trim();
  }

  if (body && typeof body === "object" && "message" in body) {
    const message = body.message;

    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  return `Request failed with status ${status}`;
}
