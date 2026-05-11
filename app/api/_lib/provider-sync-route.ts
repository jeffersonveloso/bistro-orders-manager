import crypto from "node:crypto";

import { NextResponse } from "next/server";

import type { ProviderSyncService } from "@/src/application/ports";
import { createProviderSyncService } from "@/src/application/provider-sync-service";
import { createConfiguredOrderSyncProvider } from "@/src/infrastructure/order-provider-factory";
import { createMockOrderSyncProvider } from "@/src/infrastructure/mock-order-provider";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const providerSyncSecretHeaders = {
  reconcile: "x-bistro-internal-sync-secret",
  webhook: "x-bistro-anota-webhook-secret",
} as const;

export const providerSyncSecretEnv = {
  reconcile: "BISTRO_INTERNAL_SYNC_SECRET",
  webhook: "BISTRO_ANOTA_WEBHOOK_SECRET",
} as const;

export interface ProviderSyncRouteDependencies {
  env?: NodeJS.ProcessEnv;
  service?: ProviderSyncService;
}

export function createRuntimeProviderSyncService(
  env: NodeJS.ProcessEnv = process.env,
): ProviderSyncService {
  return createProviderSyncService({
    provider: createConfiguredOrderSyncProvider(env),
    repository: getProductionRepository(),
  });
}

export function createRuntimeAcknowledgeSyncService(): ProviderSyncService {
  return createProviderSyncService({
    // Acknowledge flows mutate only sync-exception state and should not depend on
    // live provider credentials being configured.
    provider: createMockOrderSyncProvider(),
    repository: getProductionRepository(),
  });
}

export function unauthorizedResponse() {
  return jsonNoStore("Unauthorized", { status: 401 });
}

export function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

export function authenticateSharedSecret(
  headers: Headers,
  {
    env = process.env,
    secretEnvKey,
    secretHeaderName,
  }: {
    env?: NodeJS.ProcessEnv;
    secretEnvKey: keyof typeof providerSyncSecretEnv;
    secretHeaderName: keyof typeof providerSyncSecretHeaders;
  },
) {
  const expectedSecret = normalizeSecret(env[providerSyncSecretEnv[secretEnvKey]]);
  const receivedSecret = normalizeSecret(
    headers.get(providerSyncSecretHeaders[secretHeaderName]),
  );

  if (!expectedSecret || !receivedSecret) {
    return unauthorizedResponse();
  }

  const expectedBuffer = Buffer.from(expectedSecret, "utf8");
  const receivedBuffer = Buffer.from(receivedSecret, "utf8");

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return unauthorizedResponse();
  }

  return null;
}

export async function readJsonObject(
  request: Request,
  { allowEmpty = false }: { allowEmpty?: boolean } = {},
) {
  const rawBody = await request.text();
  const trimmedBody = rawBody.trim();

  if (trimmedBody.length === 0) {
    return allowEmpty
      ? ({ ok: true, value: {} } as const)
      : ({ ok: false, response: jsonNoStore("Invalid JSON body", { status: 400 }) } as const);
  }

  try {
    const parsed = JSON.parse(trimmedBody) as unknown;

    if (!isPlainObject(parsed)) {
      return {
        ok: false,
        response: jsonNoStore("Request body must be a JSON object", { status: 400 }),
      } as const;
    }

    return {
      ok: true,
      value: parsed,
    } as const;
  } catch {
    return {
      ok: false,
      response: jsonNoStore("Invalid JSON body", { status: 400 }),
    } as const;
  }
}

export function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export function readNestedOptionalString(
  record: Record<string, unknown>,
  path: readonly string[],
) {
  let current: unknown = record;

  for (const segment of path) {
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return normalizeOptionalString(current);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSecret(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : undefined;
}
