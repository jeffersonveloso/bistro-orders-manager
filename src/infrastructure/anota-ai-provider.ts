import type {
  CatalogAdminProviderPort,
  OrderSyncProviderPort,
} from "@/src/application/ports";
import type { RawProviderOrderInput } from "@/src/domain/production";
import type {
  ListCatalogItemsInput,
  ListConfirmedOrdersInput,
  ProviderCatalogItem,
  ProviderOrderLifecycle,
  ProviderOrderSnapshot,
  ProviderOrderSnapshotItem,
  ProviderOrderSnapshotItemModifier,
} from "@/src/domain/provider-sync";

const DEFAULT_ANOTA_AI_BASE_URL =
  "https://api-parceiros.anota.ai/partnerauth";
const DEFAULT_ANOTA_AI_CATALOG_BASE_URL =
  "https://api-menu.anota.ai/partnerauth";
const DEFAULT_ANOTA_AI_CATALOG_LIST_PATHS = [
  "v2/nm-category/rest/simple-item/export/v2",
] as const;

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
  catalogListPath?: string;
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

export function createAnotaAiCatalogAdminProvider(
  config: AnotaAiProviderConfig,
): CatalogAdminProviderPort {
  const fetchImpl = config.fetch ?? fetch;
  const token = readOptionalString(config.token);
  const baseUrl = normalizeCatalogBaseUrl(config.baseUrl);
  const catalogListPaths = resolveAnotaCatalogListPaths(config.catalogListPath);

  return {
    providerName() {
      return "anota_ai";
    },
    getCatalogExternalIdSupport() {
      return {
        provider: "anota_ai",
        providerLabel: "Anota AI",
        mode: "api_write",
        actionLabel: "Publicar external ID na Anota AI",
        summary:
          "O sistema gera o ID do bistrô, salva o binding local e pode publicar o external ID diretamente na Anota AI quando o item do provider já é conhecido.",
        helpUrl: "https://anota.ai/ajuda/cardapio-da-anota-ai/",
        instructions: [
          "O sistema usa o item_id real do catálogo para publicar o external ID do bistrô.",
          "Se a publicação automática falhar, revise o item no Gestor de Cardápio da Anota AI e confirme se ele continua ativo.",
          "Depois rode um novo pull do catálogo para validar a leitura do external ID já publicado.",
        ],
      };
    },
    async listCatalogItems(input: ListCatalogItemsInput) {
      const limit = normalizeRequestedLimit(input.limit);
      const updatedSince =
        typeof input.updatedSince === "string"
          ? normalizeDateTime(
              input.updatedSince,
              "listCatalogItems.updatedSince",
            )
          : undefined;
      let lastUnsupportedError: Error | null = null;

      for (const catalogPath of catalogListPaths) {
        try {
          const items = await fetchAnotaCatalogItems({
            baseUrl,
            catalogPath,
            fetchImpl,
            limit,
            token: requireNonBlankString(
              token,
              "Anota AI provider token is required to list catalog items",
            ),
            updatedSince,
          });

          return items;
        } catch (error) {
          if (
            error instanceof UnsupportedAnotaPayloadError ||
            (error instanceof AnotaAiProviderError &&
              error.code === "catalog_endpoint_not_supported")
          ) {
            lastUnsupportedError =
              error instanceof Error ? error : new Error(String(error));
            continue;
          }

          throw error;
        }
      }

      throw (
        lastUnsupportedError ??
        new AnotaAiProviderError(
          "catalog_endpoint_not_supported",
          "Unable to list catalog items from Anota AI with the configured adapter paths.",
        )
      );
    },
    async publishExternalId(input) {
      const normalizedToken = requireNonBlankString(
        token,
        "Anota AI provider token is required to publish catalog external IDs",
      );
      const response = await fetchImpl(
        buildAnotaItemExternalIdUrl(baseUrl, input.providerItemId),
        {
          method: "PUT",
          headers: buildAnotaHeaders(normalizedToken),
          body: JSON.stringify({
            document: {
              external_id: input.externalId,
            },
          }),
        },
      );
      const payload = await parseAnotaResponseBody(
        response,
        `publish external id for item "${input.providerItemId}"`,
      );

      if (!isPlainObject(payload)) {
        throw new UnsupportedAnotaPayloadError(
          `Anota AI external ID publish returned an unsupported response for item "${input.providerItemId}"`,
        );
      }

      if (payload.success !== true) {
        throw new AnotaAiProviderError(
          "publish_external_id_failed",
          `Anota AI external ID publish failed for item "${
            input.providerItemId
          }"${
            typeof payload.message === "string" ? `: ${payload.message}` : ""
          }`,
        );
      }

      return {
        status: "published",
        providerMessage: extractProviderMessage(payload) ?? "External ID publicado na Anota AI.",
      };
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

async function fetchAnotaCatalogItems({
  baseUrl,
  catalogPath,
  fetchImpl,
  limit,
  token,
  updatedSince,
}: {
  baseUrl: string;
  catalogPath: string;
  fetchImpl: FetchLike;
  limit: number;
  token: string;
  updatedSince?: string;
}): Promise<ProviderCatalogItem[]> {
  let currentPage = 1;
  let totalPages = Number.POSITIVE_INFINITY;
  const items: ProviderCatalogItem[] = [];

  while (items.length < limit && currentPage <= totalPages) {
    const response = await fetchImpl(
      buildAnotaCatalogListUrl(baseUrl, catalogPath, currentPage),
      {
        headers: buildAnotaHeaders(token),
      },
    );

    if (response.status === 404 || response.status === 422) {
      throw new AnotaAiProviderError(
        "catalog_endpoint_not_supported",
        `Anota AI catalog list path "${catalogPath}" is not available in this environment.`,
      );
    }

    const payload = await parseAnotaResponseBody(
      response,
      `list catalog items via "${catalogPath}"`,
    );
    const page = normalizeAnotaCatalogList(payload, catalogPath);
    totalPages = Math.max(1, Math.ceil(page.count / Math.max(1, page.limit)));

    for (const item of page.items) {
      if (
        typeof updatedSince === "string" &&
        item.updatedAt.localeCompare(updatedSince) < 0
      ) {
        continue;
      }

      items.push(item);

      if (items.length >= limit) {
        break;
      }
    }

    currentPage += 1;
  }

  return items;
}

function normalizeAnotaCatalogList(
  payload: unknown,
  catalogPath: string,
): { count: number; items: ProviderCatalogItem[]; limit: number } {
  const arrayPayloadEntries = extractCatalogEntryCandidates(payload);

  if (arrayPayloadEntries.length > 0) {
    return {
      count: arrayPayloadEntries.length,
      items: arrayPayloadEntries.map((entry, index) =>
        normalizeAnotaCatalogItem(entry, index, catalogPath),
      ),
      limit: arrayPayloadEntries.length || 1,
    };
  }

  const response = requirePlainObject(
    payload,
    `Anota AI catalog list response for "${catalogPath}" must be an object`,
  );

  if ("success" in response && response.success !== true) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI catalog list response failed for "${catalogPath}"${
        typeof response.message === "string" ? `: ${response.message}` : ""
      }`,
    );
  }

  const info = isPlainObject(response.info) ? response.info : response;
  const entries = firstCatalogEntryCandidates([
    info.docs,
    info.itens,
    info.items,
    info.products,
    info.data,
    info.categories,
    response.docs,
    response.itens,
    response.items,
    response.products,
    response.data,
    response.categories,
  ]);

  if (!entries) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI catalog list response for "${catalogPath}" does not contain a supported items array`,
    );
  }

  return {
    count: normalizeOptionalCount(info.count) ?? entries.length,
    items: entries.map((entry, index) =>
      normalizeAnotaCatalogItem(entry, index, catalogPath),
    ),
    limit: (normalizeOptionalCount(info.limit) ?? entries.length) || 1,
  };
}

function firstCatalogEntryCandidates(values: unknown[]) {
  for (const value of values) {
    const candidates = extractCatalogEntryCandidates(value);

    if (candidates.length > 0) {
      return candidates;
    }
  }

  return undefined;
}

function extractCatalogEntryCandidates(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const directEntries = value.filter(isDirectCatalogItemCandidate);

  if (directEntries.length > 0) {
    return directEntries;
  }

  const nestedEntries: Record<string, unknown>[] = [];

  for (const entry of value) {
    if (!isPlainObject(entry)) {
      continue;
    }

    for (const nestedKey of [
      "items",
      "itens",
      "products",
      "docs",
      "data",
      "categories",
      "children",
    ] as const) {
      nestedEntries.push(...extractCatalogEntryCandidates(entry[nestedKey]));
    }
  }

  return nestedEntries;
}

function isDirectCatalogItemCandidate(
  value: unknown,
): value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    return false;
  }

  const hasNestedCollections =
    Array.isArray(value.itens) ||
    Array.isArray(value.items) ||
    Array.isArray(value.products) ||
    Array.isArray(value.docs) ||
    Array.isArray(value.data) ||
    Array.isArray(value.categories) ||
    Array.isArray(value.children);

  if (hasNestedCollections) {
    return false;
  }

  return Boolean(
    readOptionalCatalogItemId(value) &&
      (readOptionalString(value.name) ??
        readOptionalString(value.title) ??
        readOptionalString(value.description)),
  );
}

function normalizeAnotaCatalogItem(
  entry: unknown,
  index: number,
  catalogPath: string,
): ProviderCatalogItem {
  const item = requirePlainObject(
    entry,
    `Anota AI catalog item #${index + 1} from "${catalogPath}" must be an object`,
  );
  const providerItemId = readOptionalCatalogItemId(item, {
    allowOwnIdFallback: true,
  });
  const name =
    readOptionalString(item.name) ??
    readOptionalString(item.title) ??
    readOptionalString(item.description);

  if (!providerItemId) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI catalog item #${index + 1} from "${catalogPath}" is missing a supported identifier`,
    );
  }

  if (!name) {
    throw new UnsupportedAnotaPayloadError(
      `Anota AI catalog item #${index + 1} from "${catalogPath}" is missing a supported name`,
    );
  }

  return {
    provider: "anota_ai",
    providerItemId,
    providerExternalId:
      readOptionalString(item.externalId) ??
      readOptionalString(item.external_id) ??
      readOptionalString(item.externalID) ??
      null,
    name,
    updatedAt:
      normalizeOptionalDateTime(item.updatedAt) ??
      normalizeOptionalDateTime(item.updated_at) ??
      normalizeOptionalDateTime(item.createdAt) ??
      normalizeOptionalDateTime(item.created_at) ??
      new Date(0).toISOString(),
    rawPayload: item,
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
  const items = normalizeSnapshotItemsForLifecycle(
    info.items,
    checkMapping.lifecycle,
    externalOrderId,
  );
  const customerName = readOptionalString(
    info.customer && isPlainObject(info.customer) ? info.customer.name : undefined,
  );
  const waiterName = readAssignedWaiterName(info);
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
    waiterName,
    channel,
    providerStatus: checkMapping.providerStatus,
    lifecycle: checkMapping.lifecycle,
    providerUpdatedAt,
    items,
    notes,
    rawPayload: payload,
  };
}

function normalizeSnapshotItemsForLifecycle(
  items: unknown,
  lifecycle: ProviderOrderLifecycle,
  externalOrderId: string,
) {
  if (typeof items === "undefined" || items === null) {
    if (lifecycle !== "confirmed_ready") {
      return [];
    }

    throw new UnsupportedAnotaPayloadError(
      `Anota AI order "${externalOrderId}" items must be an array`,
    );
  }

  return normalizeAnotaOrderItems(items, externalOrderId);
}

export function normalizeProviderSnapshotToProductionInput(
  snapshot: ProviderOrderSnapshot,
): RawProviderOrderInput {
  return {
    externalId: snapshot.externalOrderId,
    reference: snapshot.reference,
    customerName: snapshot.customerName,
    waiterName: snapshot.waiterName,
    channel: snapshot.channel,
    createdAt: snapshot.providerUpdatedAt,
    items: snapshot.items.map((item, index) => {
      const providerRoutingKey = item.catalogExternalId ?? item.providerItemId ?? null;

      if (!providerRoutingKey) {
        throw new UnsupportedAnotaPayloadError(
          `Anota AI order "${snapshot.externalOrderId}" item #${
            index + 1
          } (${item.name}) is missing catalog externalID and provider item ID and cannot be mapped to menuItemId`,
        );
      }

      return {
        externalItemId: item.externalItemId,
        menuItemId: providerRoutingKey,
        providerItemId: item.providerItemId ?? null,
        providerExternalId: item.catalogExternalId ?? null,
        name: item.name,
        quantity: item.quantity,
        notes: item.notes,
      };
    }),
  };
}

function readAssignedWaiterName(info: Record<string, unknown>) {
  const namedObjects = [
    info.waiter_info,
    info.waiterInfo,
    info.waiter,
    info.attendant_info,
    info.attendantInfo,
    info.attendant,
    info.server_info,
    info.serverInfo,
    info.server,
    info.employee_info,
    info.employeeInfo,
    info.employee,
    info.seller_info,
    info.sellerInfo,
    info.seller,
    info.salesperson_info,
    info.salespersonInfo,
    info.salesperson,
    info.cashier_info,
    info.cashierInfo,
    info.cashier,
    info.user_info,
    info.userInfo,
    info.user,
  ];

  for (const candidate of namedObjects) {
    if (isPlainObject(candidate)) {
      const name =
        readOptionalString(candidate.name) ??
        readOptionalString(candidate.waiter_name) ??
        readOptionalString(candidate.waiterName) ??
        readOptionalString(candidate.attendant_name) ??
        readOptionalString(candidate.attendantName) ??
        readOptionalString(candidate.server_name) ??
        readOptionalString(candidate.serverName) ??
        readOptionalString(candidate.employee_name) ??
        readOptionalString(candidate.employeeName) ??
        readOptionalString(candidate.seller_name) ??
        readOptionalString(candidate.sellerName) ??
        readOptionalString(candidate.salesperson_name) ??
        readOptionalString(candidate.salespersonName) ??
        readOptionalString(candidate.cashier_name) ??
        readOptionalString(candidate.cashierName) ??
        readOptionalString(candidate.user_name) ??
        readOptionalString(candidate.userName);

      if (name) {
        return name;
      }
    }
  }

  return (
    readOptionalString(info.waiterName) ??
    readOptionalString(info.attendantName) ??
    readOptionalString(info.serverName) ??
    readOptionalString(info.employeeName) ??
    readOptionalString(info.sellerName) ??
    readOptionalString(info.salespersonName) ??
    readOptionalString(info.cashierName) ??
    readOptionalString(info.userName)
  );
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
    providerItemId: readOptionalCatalogItemId(nextItem, {
      allowOwnIdFallback: false,
    }),
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

function readOptionalCatalogItemId(
  item: Record<string, unknown>,
  options: {
    allowOwnIdFallback: boolean;
  } = {
    allowOwnIdFallback: true,
  },
) {
  const nestedItem = isPlainObject(item.item) ? item.item : undefined;
  const nestedProduct = isPlainObject(item.product) ? item.product : undefined;
  const nestedCatalogItem = isPlainObject(item.catalogItem)
    ? item.catalogItem
    : undefined;

  const explicitCatalogItemId =
    readOptionalString(item.catalogItemId) ??
    readOptionalString(item.catalog_item_id) ??
    readOptionalString(item.productId) ??
    readOptionalString(item.product_id) ??
    readOptionalString(item.internalId) ??
    readOptionalString(item.internal_id) ??
    readOptionalString(item.itemId) ??
    readOptionalString(item.item_id) ??
    readOptionalString(nestedCatalogItem?._id) ??
    readOptionalString(nestedCatalogItem?.id) ??
    readOptionalString(nestedProduct?._id) ??
    readOptionalString(nestedProduct?.id) ??
    readOptionalString(nestedItem?._id) ??
    readOptionalString(nestedItem?.id);

  if (explicitCatalogItemId) {
    return explicitCatalogItemId;
  }

  if (!options.allowOwnIdFallback) {
    return null;
  }

  return readOptionalString(item._id) ?? readOptionalString(item.id) ?? null;
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
  return buildAnotaPagedUrl(baseUrl, "ping/list", currentPage);
}

function buildAnotaPagedUrl(
  baseUrl: string,
  pathname: string,
  currentPage: number,
) {
  const url = buildAnotaUrl(baseUrl, pathname);

  url.searchParams.set("currentpage", String(currentPage));

  return url;
}

function buildAnotaCatalogListUrl(
  baseUrl: string,
  pathname: string,
  currentPage: number,
) {
  if (pathname.includes("/export/")) {
    return buildAnotaUrl(baseUrl, pathname);
  }

  return buildAnotaPagedUrl(baseUrl, pathname, currentPage);
}

function buildAnotaItemExternalIdUrl(baseUrl: string, providerItemId: string) {
  return buildAnotaUrl(
    baseUrl,
    `v2/item/external-id/${encodeURIComponent(providerItemId)}`,
  );
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

function normalizeCatalogBaseUrl(baseUrl?: string) {
  const resolvedBaseUrl =
    readOptionalString(baseUrl) ?? DEFAULT_ANOTA_AI_CATALOG_BASE_URL;

  return resolvedBaseUrl.replace(/\/+$/, "");
}

function normalizeRequestedLimit(limit: number | undefined) {
  if (typeof limit !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  return normalizeCount(limit, "Anota AI listConfirmedOrders limit");
}

function resolveAnotaCatalogListPaths(catalogListPath?: string) {
  const normalizedPath = readOptionalString(catalogListPath);

  if (normalizedPath) {
    return [normalizedPath];
  }

  return [...DEFAULT_ANOTA_AI_CATALOG_LIST_PATHS];
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

function normalizeOptionalCount(value: unknown) {
  if (value == null) {
    return undefined;
  }

  return normalizeCount(value, "Anota AI count");
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

function normalizeOptionalDateTime(value: unknown) {
  const nextValue = readOptionalString(value);

  if (!nextValue) {
    return undefined;
  }

  return normalizeDateTime(nextValue, "Anota AI dateTime");
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
