import type {
  CatalogAdminProviderPort,
  OrderSyncProviderPort,
} from "@/src/application/ports";
import {
  createAnotaAiCatalogAdminProvider,
  createAnotaAiProvider,
} from "@/src/infrastructure/anota-ai-provider";
import {
  createMockCatalogAdminProvider,
  createMockOrderSyncProvider,
} from "@/src/infrastructure/mock-order-provider";

export const orderSyncProviderModes = ["mock", "anota_ai"] as const;
export type OrderSyncProviderMode = (typeof orderSyncProviderModes)[number];

export const orderSyncProviderEnv = {
  anotaAiBaseUrl: "BISTRO_ANOTA_AI_BASE_URL",
  anotaAiCatalogBaseUrl: "BISTRO_ANOTA_AI_CATALOG_BASE_URL",
  anotaAiCatalogListPath: "BISTRO_ANOTA_AI_CATALOG_LIST_PATH",
  anotaAiToken: "BISTRO_ANOTA_AI_TOKEN",
  mode: "BISTRO_ORDER_SYNC_PROVIDER_MODE",
} as const;

export interface CreateOrderSyncProviderConfig {
  anotaAiBaseUrl?: string;
  anotaAiCatalogBaseUrl?: string;
  anotaAiCatalogListPath?: string;
  anotaAiToken?: string;
  fetch?: typeof fetch;
  mode?: OrderSyncProviderMode;
}

export function createConfiguredOrderSyncProvider(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Omit<CreateOrderSyncProviderConfig, "mode"> = {},
): OrderSyncProviderPort {
  const mode = parseOrderSyncProviderMode(env[orderSyncProviderEnv.mode]) ?? "mock";

  return createOrderSyncProvider({
    ...overrides,
    anotaAiBaseUrl:
      overrides.anotaAiBaseUrl ?? env[orderSyncProviderEnv.anotaAiBaseUrl],
    anotaAiToken:
      overrides.anotaAiToken ?? env[orderSyncProviderEnv.anotaAiToken],
    mode,
  });
}

export function createOrderSyncProvider(
  config: CreateOrderSyncProviderConfig = {},
): OrderSyncProviderPort {
  const mode = config.mode ?? "mock";

  if (mode === "mock") {
    return createMockOrderSyncProvider();
  }

  if (mode === "anota_ai") {
    return createAnotaAiProvider({
      baseUrl: config.anotaAiBaseUrl,
      fetch: config.fetch,
      token: requireNonBlankString(
        config.anotaAiToken,
        `Environment variable ${orderSyncProviderEnv.anotaAiToken} is required when ${orderSyncProviderEnv.mode}=anota_ai`,
      ),
    });
  }

  throw new TypeError(`Unsupported order sync provider mode "${String(mode)}"`);
}

export function createConfiguredCatalogAdminProvider(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Omit<CreateOrderSyncProviderConfig, "mode"> = {},
): CatalogAdminProviderPort {
  const mode = parseOrderSyncProviderMode(env[orderSyncProviderEnv.mode]) ?? "mock";

  return createCatalogAdminProvider({
    ...overrides,
    anotaAiBaseUrl:
      overrides.anotaAiBaseUrl ?? env[orderSyncProviderEnv.anotaAiBaseUrl],
    anotaAiCatalogBaseUrl:
      overrides.anotaAiCatalogBaseUrl ??
      env[orderSyncProviderEnv.anotaAiCatalogBaseUrl],
    anotaAiCatalogListPath:
      overrides.anotaAiCatalogListPath ??
      env[orderSyncProviderEnv.anotaAiCatalogListPath],
    anotaAiToken:
      overrides.anotaAiToken ?? env[orderSyncProviderEnv.anotaAiToken],
    mode,
  });
}

export function createCatalogAdminProvider(
  config: CreateOrderSyncProviderConfig = {},
): CatalogAdminProviderPort {
  const mode = config.mode ?? "mock";

  if (mode === "mock") {
    return createMockCatalogAdminProvider();
  }

  if (mode === "anota_ai") {
    return createAnotaAiCatalogAdminProvider({
      baseUrl: config.anotaAiCatalogBaseUrl,
      catalogListPath: config.anotaAiCatalogListPath,
      fetch: config.fetch,
      token: config.anotaAiToken ?? "",
    });
  }

  throw new TypeError(`Unsupported catalog admin provider mode "${String(mode)}"`);
}

export function parseOrderSyncProviderMode(
  value: string | null | undefined,
): OrderSyncProviderMode | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase();

  return orderSyncProviderModes.find((mode) => mode === normalizedValue);
}

function requireNonBlankString(
  value: string | undefined,
  message: string,
) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(message);
  }

  return value.trim();
}
