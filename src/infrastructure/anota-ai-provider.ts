import type { OrderSyncProviderPort } from "@/src/application/ports";
import type { RawProviderOrderInput } from "@/src/domain/production";
import type {
  ListConfirmedOrdersInput,
  ProviderOrderLifecycle,
  ProviderOrderSnapshot,
  ProviderOrderSnapshotItem,
  ProviderOrderSnapshotItemModifier,
} from "@/src/domain/provider-sync";

const DEFAULT_ANOTA_AI_BASE_URL =
  "https://api-parceiros.anota.ai/partnerauth";

type FetchLike = typeof fetch;

type AnotaOrderCheckCode = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface AnotaOrderCheckMapping {
  lifecycle: ProviderOrderLifecycle;
  providerStatus: string;
}

interface NormalizedAnotaOrderListEntry {
  externalOrderId: string;
  check: AnotaOrderCheckCode;
  updatedAt: string;
}

interface AnotaAiProviderConfig {
  baseUrl?: string;
  fetch?: FetchLike;
  token: string;
}

const anotaOrderCheckMappings: Record<AnotaOrderCheckCode, AnotaOrderCheckMapping> =
  {
    0: {
      lifecycle: "pending_confirmation",
      providerStatus: "under_review",
    },
    1: {
      lifecycle: "confirmed_ready",
      providerStatus: "in_production",
    },
    2: {
      lifecycle: "confirmed_ready",
      providerStatus: "ready",
    },
    3: {
      lifecycle: "confirmed_ready",
      providerStatus: "finalized",
    },
    4: {
      lifecycle: "canceled",
      providerStatus: "canceled",
    },
    5: {
      lifecycle: "canceled",
      providerStatus: "denied",
    },
    6: {
      lifecycle: "canceled",
      providerStatus: "cancellation_requested",
    },
  };

export class AnotaAiProviderError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AnotaAiProviderError";
    this.code = code;
  }
}

export class UnsupportedAnotaPayloadError extends AnotaAiProviderError {
  constructor(message: string) {
    super("unsupported_payload", message);
    this.name = "UnsupportedAnotaPayloadError";
  }
}

export function createAnotaAiProvider(
  config: AnotaAiProviderConfig,
): OrderSyncProviderPort {
  const fetchImpl = config.fetch ?? fetch;
  const token = requireNonBlankString(
    config.token,
    "Anota AI provider token is required",
  );
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const fetchOrderById = async (externalOrderId: string) => {
    const response = await fetchImpl(
      buildAnotaUrl(baseUrl, `ping/get/${encodeURIComponent(externalOrderId)}`),
      {
        headers: buildAnotaHeaders(token),
      },
    );

    if (response.status === 404) {
      return null;
    }

    const payload = await parseAnotaResponseBody(response, "fetch order by id");

    return normalizeAnotaOrderSnapshot(payload, externalOrderId);
  };

  return {
    providerName() {
      return "anota_ai";
    },
    fetchOrderById,
    async listConfirmedOrders(input: ListConfirmedOrdersInput) {
      const limit = normalizeRequestedLimit(input.limit);
      const updatedSince =
        typeof input.updatedSince === "string"
          ? normalizeDateTime(
              input.updatedSince,
              "listConfirmedOrders.updatedSince",
            )
          : undefined;
      const collectedIds: string[] = [];
      let currentPage = 1;
      let totalPages = Number.POSITIVE_INFINITY;

      while (
        collectedIds.length < limit &&
        currentPage <= totalPages
      ) {
        const response = await fetchImpl(
          buildAnotaListUrl(baseUrl, currentPage),
          {
            headers: buildAnotaHeaders(token),
          },
        );
        const payload = await parseAnotaResponseBody(
          response,
          "list confirmed orders",
        );
        const page = normalizeAnotaOrderList(payload);
        totalPages = Math.max(
          1,
          Math.ceil(page.count / Math.max(1, page.limit)),
        );

        for (const entry of page.docs) {
          const mapping = mapAnotaOrderCheck(entry.check);

          if (mapping.lifecycle !== "confirmed_ready") {
            continue;
          }

          if (
            typeof updatedSince === "string" &&
            entry.updatedAt.localeCompare(updatedSince) < 0
          ) {
            continue;
          }

          collectedIds.push(entry.externalOrderId);

          if (collectedIds.length >= limit) {
            break;
          }
        }

        currentPage += 1;
      }

      const snapshots: ProviderOrderSnapshot[] = [];

      for (const externalOrderId of collectedIds) {
        const snapshot = await fetchOrderById(externalOrderId);

        if (!snapshot) {
          throw new UnsupportedAnotaPayloadError(
            `Anota AI list returned order "${externalOrderId}" but canonical fetch returned no order details`,
          );
        }

        if (snapshot.lifecycle === "confirmed_ready") {
          snapshots.push(snapshot);
        }
      }

      return snapshots;
    },
    toProductionInput(snapshot) {
      return normalizeProviderSnapshotToProductionInput(snapshot);
    },
  };
}

export function mapAnotaOrderCheck(
  check: unknown,
): AnotaOrderCheckMapping & { check: AnotaOrderCheckCode } {
  const numericCheck = normalizeCheckCode(check);
  const mapping = anotaOrderCheckMappings[numericCheck];

  if (!mapping) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI order check "${String(check)}" is not supported by the phase 1 lifecycle mapping`,
    );
  }

  return {
    check: numericCheck,
    ...mapping,
  };
}

export function normalizeAnotaOrderSnapshot(
  payload: unknown,
  requestedExternalOrderId?: string,
): ProviderOrderSnapshot {
  const response = requirePlainObject(
    payload,
    "Anota AI canonical order response must be an object",
  );
  const success = response.success;

  if (success !== true) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI canonical order response failed${
        typeof response.message === "string" ? `: ${response.message}` : ""
      }`,
    );
  }

  const info = requirePlainObject(
    response.info,
    "Anota AI canonical order response is missing the info object",
  );
  const externalOrderId = readRequiredString(
    info._id ?? info.id ?? requestedExternalOrderId,
    "Anota AI order info._id",
  );
  const checkMapping = mapAnotaOrderCheck(info.check);
  const providerUpdatedAt = normalizeDateTime(
    readRequiredString(
      info.updatedAt ?? info.preparationStartDateTime ?? info.createdAt,
      `Anota AI order "${externalOrderId}" updatedAt`,
    ),
    `Anota AI order "${externalOrderId}" updatedAt`,
  );
  const items = normalizeAnotaOrderItems(info.items, externalOrderId);
  const customerName = readOptionalString(
    info.customer && isPlainObject(info.customer) ? info.customer.name : undefined,
  );
  const channel =
    readOptionalString(info.salesChannel) ??
    readOptionalString(info.from) ??
    "anota_ai";
  const reference =
    readOptionalString(info.shortReference)?.trim() ??
    readOptionalString(info.id)?.trim() ??
    externalOrderId;
  const notes =
    readOptionalString(info.observation) ??
    readOptionalString(info.notes);

  return {
    provider: "anota_ai",
    externalOrderId,
    reference,
    customerName,
    channel,
    providerStatus: checkMapping.providerStatus,
    lifecycle: checkMapping.lifecycle,
    providerUpdatedAt,
    items,
    notes,
    rawPayload: payload,
  };
}

export function normalizeProviderSnapshotToProductionInput(
  snapshot: ProviderOrderSnapshot,
): RawProviderOrderInput {
  return {
    externalId: snapshot.externalOrderId,
    reference: snapshot.reference,
    customerName: snapshot.customerName,
    channel: snapshot.channel,
    createdAt: snapshot.providerUpdatedAt,
    items: snapshot.items.map((item, index) => {
      if (!item.catalogExternalId) {
        throw new UnsupportedAnotaPayloadError(
          `Anota AI order "${snapshot.externalOrderId}" item #${
            index + 1
          } (${item.name}) is missing catalog externalID and cannot be mapped to menuItemId`,
        );
      }

      return {
        externalItemId: item.externalItemId,
        menuItemId: item.catalogExternalId,
        name: item.name,
        quantity: item.quantity,
        notes: item.notes,
      };
    }),
  };
}

function normalizeAnotaOrderList(
  payload: unknown,
): { count: number; docs: NormalizedAnotaOrderListEntry[]; limit: number } {
  const response = requirePlainObject(
    payload,
    "Anota AI order list response must be an object",
  );

  if (response.success !== true) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI order list response failed${
        typeof response.message === "string" ? `: ${response.message}` : ""
      }`,
    );
  }

  const info = requirePlainObject(
    response.info,
    "Anota AI order list response is missing the info object",
  );
  const docs = requireArray(
    info.docs,
    "Anota AI order list response info.docs must be an array",
  ).map((entry, index) => normalizeAnotaOrderListEntry(entry, index));

  return {
    docs,
    count: normalizeCount(info.count, "Anota AI order list count"),
    limit: normalizeCount(info.limit, "Anota AI order list limit"),
  };
}

function normalizeAnotaOrderListEntry(
  entry: unknown,
  index: number,
): NormalizedAnotaOrderListEntry {
  const nextEntry = requirePlainObject(
    entry,
    `Anota AI order list entry #${index + 1} must be an object`,
  );

  return {
    externalOrderId: readRequiredString(
      nextEntry._id ?? nextEntry.id,
      `Anota AI order list entry #${index + 1} _id`,
    ),
    check: normalizeCheckCode(nextEntry.check),
    updatedAt: normalizeDateTime(
      readRequiredString(
        nextEntry.updatedAt,
        `Anota AI order list entry #${index + 1} updatedAt`,
      ),
      `Anota AI order list entry #${index + 1} updatedAt`,
    ),
  };
}

function normalizeAnotaOrderItems(
  items: unknown,
  externalOrderId: string,
): ProviderOrderSnapshotItem[] {
  return requireArray(
    items,
    `Anota AI order "${externalOrderId}" items must be an array`,
  ).map((entry, index) =>
    normalizeAnotaOrderItem(entry, externalOrderId, index),
  );
}

function normalizeAnotaOrderItem(
  item: unknown,
  externalOrderId: string,
  index: number,
): ProviderOrderSnapshotItem {
  const nextItem = requirePlainObject(
    item,
    `Anota AI order "${externalOrderId}" item #${index + 1} must be an object`,
  );

  return {
    externalItemId: readRequiredString(
      nextItem._id ?? nextItem.id,
      `Anota AI order "${externalOrderId}" item #${index + 1} identifier`,
    ),
    catalogExternalId:
      readOptionalString(nextItem.externalId) ??
      readOptionalString(nextItem.external_id) ??
      null,
    name: readRequiredString(
      nextItem.name,
      `Anota AI order "${externalOrderId}" item #${index + 1} name`,
    ),
    quantity: normalizeQuantity(
      nextItem.quantity,
      `Anota AI order "${externalOrderId}" item #${index + 1} quantity`,
    ),
    notes:
      readOptionalString(nextItem.observation) ??
      readOptionalString(nextItem.notes),
    modifiers: normalizeAnotaOrderModifiers(
      nextItem.subItems,
      externalOrderId,
      index,
    ),
  };
}

function normalizeAnotaOrderModifiers(
  modifiers: unknown,
  externalOrderId: string,
  itemIndex: number,
): ProviderOrderSnapshotItemModifier[] {
  if (modifiers == null) {
    return [];
  }

  return requireArray(
    modifiers,
    `Anota AI order "${externalOrderId}" item #${
      itemIndex + 1
    } subItems must be an array`,
  ).map((entry, modifierIndex) => {
    const modifier = requirePlainObject(
      entry,
      `Anota AI order "${externalOrderId}" item #${
        itemIndex + 1
      } modifier #${modifierIndex + 1} must be an object`,
    );

    return {
      name: readRequiredString(
        modifier.name ?? modifier.title ?? modifier.description,
        `Anota AI order "${externalOrderId}" item #${
          itemIndex + 1
        } modifier #${modifierIndex + 1} name`,
      ),
      quantity:
        modifier.quantity == null
          ? undefined
          : normalizeQuantity(
              modifier.quantity,
              `Anota AI order "${externalOrderId}" item #${
                itemIndex + 1
              } modifier #${modifierIndex + 1} quantity`,
            ),
      notes:
        readOptionalString(modifier.observation) ??
        readOptionalString(modifier.notes),
    };
  });
}

async function parseAnotaResponseBody(
  response: Response,
  action: string,
): Promise<unknown> {
  const bodyText = await response.text();
  let payload: unknown;

  try {
    payload = bodyText.length > 0 ? JSON.parse(bodyText) : null;
  } catch {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI ${action} response was not valid JSON`,
    );
  }

  if (!response.ok) {
    const message =
      extractProviderMessage(payload) ??
      bodyText ??
      `Request failed with status ${response.status}`;

    throw new AnotaAiProviderError(
      "request_failed",
      `Anota AI ${action} failed with status ${response.status}: ${message}`,
    );
  }

  return payload;
}

function extractProviderMessage(payload: unknown) {
  if (!isPlainObject(payload)) {
    return undefined;
  }

  return readOptionalString(payload.message);
}

function buildAnotaListUrl(baseUrl: string, currentPage: number) {
  const url = new URL(`${baseUrl}/ping/list`);

  url.searchParams.set("currentpage", String(currentPage));

  return url;
}

function buildAnotaUrl(baseUrl: string, pathname: string) {
  return new URL(`${baseUrl}/${pathname}`);
}

function buildAnotaHeaders(token: string) {
  return {
    Accept: "application/json",
    Authorization: token,
    "Content-Type": "application/json",
  };
}

function normalizeBaseUrl(baseUrl?: string) {
  const resolvedBaseUrl = readOptionalString(baseUrl) ?? DEFAULT_ANOTA_AI_BASE_URL;

  return resolvedBaseUrl.replace(/\/+$/, "");
}

function normalizeRequestedLimit(limit: number | undefined) {
  if (typeof limit !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  return normalizeCount(limit, "Anota AI listConfirmedOrders limit");
}

function normalizeCount(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);

    if (Number.isInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  throw new UnsupportedAnotaPayloadError(`${fieldName} must be a positive integer`);
}

function normalizeCheckCode(value: unknown): AnotaOrderCheckCode {
  if (typeof value === "number" && Number.isInteger(value) && value in anotaOrderCheckMappings) {
    return value as AnotaOrderCheckCode;
  }

  if (typeof value === "string") {
    const parsedValue = Number.parseInt(value, 10);

    if (
      Number.isInteger(parsedValue) &&
      parsedValue in anotaOrderCheckMappings
    ) {
      return parsedValue as AnotaOrderCheckCode;
    }
  }

  throw new UnsupportedAnotaPayloadError(
    `Anota AI order check "${String(value)}" is not supported by the phase 1 lifecycle mapping`,
  );
}

function normalizeDateTime(value: string, fieldName: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new UnsupportedAnotaPayloadError(
      `${fieldName} must be a valid ISO-8601 datetime string`,
    );
  }

  return value;
}

function normalizeQuantity(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  throw new UnsupportedAnotaPayloadError(`${fieldName} must be a positive number`);
}

function requireArray(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new UnsupportedAnotaPayloadError(message);
  }

  return value;
}

function requirePlainObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new UnsupportedAnotaPayloadError(message);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    return undefined;
  }

  const nextValue = value.trim();

  return nextValue.length > 0 ? nextValue : undefined;
}

function readRequiredString(value: unknown, fieldName: string) {
  const nextValue = readOptionalString(value);

  if (!nextValue) {
    throw new UnsupportedAnotaPayloadError(`${fieldName} is required`);
  }

  return nextValue;
}

function requireNonBlankString(value: string | undefined, message: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(message);
  }

  return value.trim();
}
