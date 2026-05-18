import crypto from "node:crypto";

import type {
  CatalogAdminProviderPort,
  CatalogExternalIdSupport,
  PublishCatalogExternalIdResult,
  ProviderSyncService,
} from "@/src/application/ports";
import {
  isKitchenId,
  type Kitchen,
  type KitchenId,
  type MenuItemKitchenMapping,
} from "@/src/domain/production";
import type {
  ProviderCatalogItem,
  ProviderName,
  ProviderOrderSnapshot,
  ProviderOrderState,
  SyncExceptionRecord,
} from "@/src/domain/provider-sync";

const DEFAULT_PROVIDER_PULL_LIMIT = 60;
const DEFAULT_PROVIDER_CATALOG_LIMIT = 500;
const DEFAULT_PROVIDER_PULL_WINDOW_DAYS = 7;

export interface CatalogMappingRepository {
  listKitchens(): Kitchen[];
  listKitchenMappings(): MenuItemKitchenMapping[];
  upsertKitchenMapping(mapping: MenuItemKitchenMapping): void;
  listProviderCatalogItems(): ProviderCatalogItem[];
  upsertProviderCatalogItems(items: ProviderCatalogItem[]): void;
  listProviderOrders(): ProviderOrderState[];
  listUnresolvedSyncExceptions(): SyncExceptionRecord[];
}

export interface CatalogMappingEntry {
  menuItemId: string;
  menuItemName: string;
  kitchenId: KitchenId;
  kitchenName: string;
  providerItemId: string | null;
  providerExternalId: string | null;
  providerCatalogDescription: string | null;
  providerCatalogName: string | null;
  providerCatalogUpdatedAt: string | null;
}

export interface CatalogPendingProviderItem {
  key: string;
  provider: ProviderName;
  providerItemId: string | null;
  providerExternalId: string | null;
  suggestedMenuItemId: string | null;
  latestName: string;
  latestDescription: string | null;
  status: "needs_mapping" | "missing_external_id";
  lastSeenAt: string;
  seenOrderCount: number;
  sourceOrders: Array<{
    externalOrderId: string;
    reference: string;
    providerUpdatedAt: string;
  }>;
}

export interface CatalogMappingPageData {
  kitchens: Kitchen[];
  mappings: CatalogMappingEntry[];
  pendingProviderItems: CatalogPendingProviderItem[];
  providerExternalIdSupport: CatalogExternalIdSupport | null;
  providerCatalogStatus: {
    errorMessage: string | null;
    fetchedItemCount: number;
    status: "failed" | "loaded" | "not_requested";
  };
  metrics: {
    totalMappings: number;
    pendingProviderItems: number;
    pendingMissingExternalIdItems: number;
    pendingMissingMappingOrders: number;
  };
  generatedAt: string;
}

export interface ProviderCatalogPullResult {
  provider: ProviderName;
  pulledAt: string;
  limitUsed: number;
  updatedSinceUsed: string;
  catalogItemsScanned: number;
  pendingProviderItems: CatalogPendingProviderItem[];
  metrics: {
    pendingProviderItems: number;
    pendingMissingExternalIdItems: number;
  };
}

export interface UpsertCatalogMappingInput {
  kitchenId: unknown;
  menuItemId: unknown;
  menuItemName: unknown;
  providerItemId?: unknown;
  providerExternalId?: unknown;
  mirrorMenuItemIdToProviderExternalId?: unknown;
  publishProviderExternalId?: unknown;
}

export interface CatalogProviderPublication {
  providerItemId: string;
  externalId: string;
  status: PublishCatalogExternalIdResult["status"];
  providerMessage: string | null;
}

export interface UpsertCatalogMappingResult {
  mapping: MenuItemKitchenMapping;
  providerPublication: CatalogProviderPublication | null;
  replay: {
    attemptedCount: number;
    importedOrders: number;
    replayedExternalOrderIds: string[];
    remainingBlockingExceptions: number;
    failedAttempts: number;
  };
}

export function getCatalogMappingPageData(
  repository: CatalogMappingRepository,
  {
    additionalPendingProviderItems = [],
    providerExternalIdSupport = null,
    providerCatalogStatus = {
      errorMessage: null,
      fetchedItemCount: 0,
      status: "not_requested" as const,
    },
  }: {
    additionalPendingProviderItems?: CatalogPendingProviderItem[];
    providerExternalIdSupport?: CatalogExternalIdSupport | null;
    providerCatalogStatus?: CatalogMappingPageData["providerCatalogStatus"];
  } = {},
): CatalogMappingPageData {
  const kitchens = repository.listKitchens();
  const mappings = repository.listKitchenMappings();
  const providerCatalogItems = repository.listProviderCatalogItems();
  const providerCatalogIndex = buildProviderCatalogIndex(providerCatalogItems);
  const pendingProviderItems = mergeCatalogPendingProviderItems(
    collectPendingProviderItems(
      repository.listProviderOrders().map((state) => state.snapshot),
      mappings,
    ),
    collectPendingProviderCatalogItems(providerCatalogItems, mappings),
    additionalPendingProviderItems,
  );
  const pendingMissingMappingOrders = repository
    .listUnresolvedSyncExceptions()
    .filter((exception) => exception.kind === "missing_mapping").length;

  return {
    kitchens,
    mappings: mappings.map((mapping) => {
      const providerCatalogItem = findProviderCatalogItemForMapping(
        mapping,
        providerCatalogIndex,
      );

      return {
        kitchenId: mapping.kitchenId,
        kitchenName:
          kitchens.find((kitchen) => kitchen.id === mapping.kitchenId)?.name ??
          mapping.kitchenId,
        menuItemId: mapping.menuItemId,
        menuItemName: mapping.menuItemName,
        providerItemId: mapping.providerItemId ?? null,
        providerExternalId: mapping.providerExternalId ?? null,
        providerCatalogDescription: providerCatalogItem?.description ?? null,
        providerCatalogName: providerCatalogItem?.name ?? null,
        providerCatalogUpdatedAt: providerCatalogItem?.updatedAt ?? null,
      };
    }),
    pendingProviderItems,
    providerExternalIdSupport,
    providerCatalogStatus,
    metrics: {
      totalMappings: mappings.length,
      pendingProviderItems: pendingProviderItems.filter(
        (item) => item.status === "needs_mapping",
      ).length,
      pendingMissingExternalIdItems: pendingProviderItems.filter(
        (item) => item.status === "missing_external_id",
      ).length,
      pendingMissingMappingOrders,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getCatalogMappingPageDataFromProvider({
  catalogAdminProvider,
  repository,
  providerExternalIdSupport = null,
}: {
  catalogAdminProvider: {
    listCatalogItems(input: {
      limit?: number;
    }): Promise<ProviderCatalogItem[]>;
  };
  repository: CatalogMappingRepository;
  providerExternalIdSupport?: CatalogExternalIdSupport | null;
}) {
  let additionalPendingProviderItems: CatalogPendingProviderItem[] = [];
  let providerCatalogStatus: CatalogMappingPageData["providerCatalogStatus"] = {
    errorMessage: null,
    fetchedItemCount: 0,
    status: "not_requested",
  };

  try {
    const catalogItems = await catalogAdminProvider.listCatalogItems({
      limit: DEFAULT_PROVIDER_CATALOG_LIMIT,
    });
    repository.upsertProviderCatalogItems(catalogItems);
    additionalPendingProviderItems = collectPendingProviderCatalogItems(
      catalogItems,
      repository.listKitchenMappings(),
    );
    providerCatalogStatus = {
      errorMessage: null,
      fetchedItemCount: catalogItems.length,
      status: "loaded",
    };
  } catch (error) {
    additionalPendingProviderItems = [];
    providerCatalogStatus = {
      errorMessage:
        error instanceof Error
          ? error.message
          : "Falha ao carregar o catálogo do provider.",
      fetchedItemCount: 0,
      status: "failed",
    };
  }

  return getCatalogMappingPageData(repository, {
    additionalPendingProviderItems,
    providerExternalIdSupport,
    providerCatalogStatus,
  });
}

export async function previewProviderCatalogPull({
  provider,
  repository,
  limit = DEFAULT_PROVIDER_PULL_LIMIT,
  updatedSince,
}: {
  provider: {
    listCatalogItems(input: {
      limit?: number;
      updatedSince?: string;
    }): Promise<ProviderCatalogItem[]>;
    providerName(): ProviderName;
  };
  repository: Pick<
    CatalogMappingRepository,
    "listKitchenMappings" | "upsertProviderCatalogItems"
  >;
  limit?: number;
  updatedSince?: string;
}): Promise<ProviderCatalogPullResult> {
  const normalizedLimit = normalizeOptionalPositiveInteger(limit) ??
    DEFAULT_PROVIDER_PULL_LIMIT;
  const updatedSinceUsed =
    normalizeOptionalDateTime(updatedSince) ?? buildDefaultPullWindow();
  const catalogItems = await provider.listCatalogItems({
    limit: normalizedLimit,
    updatedSince: updatedSinceUsed,
  });
  repository.upsertProviderCatalogItems(catalogItems);
  const pendingProviderItems = collectPendingProviderCatalogItems(
    catalogItems,
    repository.listKitchenMappings(),
  );

  return {
    provider: provider.providerName(),
    pulledAt: new Date().toISOString(),
    limitUsed: normalizedLimit,
    updatedSinceUsed,
    catalogItemsScanned: catalogItems.length,
    pendingProviderItems,
    metrics: {
      pendingProviderItems: pendingProviderItems.filter(
        (item) => item.status === "needs_mapping",
      ).length,
      pendingMissingExternalIdItems: pendingProviderItems.filter(
        (item) => item.status === "missing_external_id",
      ).length,
    },
  };
}

export async function upsertCatalogMappingAndReplay({
  catalogAdminProvider,
  input,
  generateMenuItemId,
  repository,
  syncService,
}: {
  catalogAdminProvider?: CatalogAdminProviderPort;
  input: UpsertCatalogMappingInput;
  generateMenuItemId?: () => string;
  repository: CatalogMappingRepository;
  syncService: ProviderSyncService;
}): Promise<UpsertCatalogMappingResult> {
  const existingMappings = repository.listKitchenMappings();
  const mapping = normalizeCatalogMappingInput({
    existingMappings,
    generateMenuItemId,
    input,
  });
  const providerPublication = await maybePublishProviderExternalId({
    catalogAdminProvider,
    input,
    mapping,
  });
  repository.upsertKitchenMapping(mapping);

  const replayTargets = collectReplayTargets(
    repository.listUnresolvedSyncExceptions(),
    mapping.providerExternalId ?? mapping.menuItemId,
  );
  let importedOrders = 0;
  let failedAttempts = 0;
  const replayedExternalOrderIds: string[] = [];

  for (const target of replayTargets) {
    replayedExternalOrderIds.push(target.externalOrderId);

    try {
      const result = await syncService.reconcileConfirmedOrders({
        provider: target.provider,
        externalOrderId: target.externalOrderId,
      });

      importedOrders += result.imported;

      if (result.status === "failed" || result.errorCount > 0) {
        failedAttempts += 1;
      }
    } catch {
      failedAttempts += 1;
    }
  }

  return {
    mapping,
    providerPublication,
    replay: {
      attemptedCount: replayTargets.length,
      importedOrders,
      replayedExternalOrderIds,
      remainingBlockingExceptions: collectReplayTargets(
        repository.listUnresolvedSyncExceptions(),
        mapping.providerExternalId ?? mapping.menuItemId,
      ).length,
      failedAttempts,
    },
  };
}

function normalizeCatalogMappingInput(
  {
    existingMappings,
    generateMenuItemId = () => crypto.randomUUID(),
    input,
  }: {
    existingMappings: MenuItemKitchenMapping[];
    generateMenuItemId?: () => string;
    input: UpsertCatalogMappingInput;
  },
): MenuItemKitchenMapping {
  const menuItemName = normalizeRequiredString(
    input.menuItemName,
    "menuItemName",
  );
  const kitchenId = normalizeRequiredString(input.kitchenId, "kitchenId");
  const providerItemId = normalizeOptionalString(input.providerItemId);
  const providerExternalId = normalizeOptionalString(input.providerExternalId);
  const requestedMenuItemId = normalizeOptionalString(input.menuItemId);
  const mirrorMenuItemIdToProviderExternalId =
    input.mirrorMenuItemIdToProviderExternalId === true;
  const normalizedMenuItemName = normalizeLooseKey(menuItemName);

  if (!isKitchenId(kitchenId)) {
    throw new TypeError("Invalid kitchenId");
  }

  const existingByProviderExternalId = providerExternalId
    ? existingMappings.find(
        (mapping) => mapping.providerExternalId === providerExternalId,
      )
    : undefined;
  const existingByProviderItemId = providerItemId
    ? existingMappings.find((mapping) => mapping.providerItemId === providerItemId)
    : undefined;
  const existingByMenuItemId = requestedMenuItemId
    ? existingMappings.find((mapping) => mapping.menuItemId === requestedMenuItemId)
    : undefined;
  const existingByMenuItemName = existingMappings.find(
    (mapping) => normalizeLooseKey(mapping.menuItemName) === normalizedMenuItemName,
  );
  const matchedMappings = [
    existingByProviderExternalId,
    existingByProviderItemId,
    existingByMenuItemId,
    existingByMenuItemName,
  ].filter((mapping): mapping is MenuItemKitchenMapping => Boolean(mapping));
  const matchedMenuItemIds = new Set(
    matchedMappings.map((mapping) => mapping.menuItemId),
  );

  if (matchedMenuItemIds.size > 1) {
    throw new TypeError(
      "Mapping conflict: provider item ID, external ID or item name already belong to different catalog rows.",
    );
  }

  const menuItemId =
    existingByProviderExternalId?.menuItemId ??
    existingByProviderItemId?.menuItemId ??
    existingByMenuItemId?.menuItemId ??
    existingByMenuItemName?.menuItemId ??
    requestedMenuItemId ??
    generateMenuItemId();

  return {
    kitchenId,
    menuItemId,
    menuItemName,
    providerItemId:
      providerItemId ??
      existingByProviderItemId?.providerItemId ??
      existingByProviderExternalId?.providerItemId ??
      existingByMenuItemId?.providerItemId ??
      existingByMenuItemName?.providerItemId ??
      null,
    providerExternalId:
      providerExternalId ??
      existingByProviderExternalId?.providerExternalId ??
      existingByProviderItemId?.providerExternalId ??
      existingByMenuItemId?.providerExternalId ??
      existingByMenuItemName?.providerExternalId ??
      (mirrorMenuItemIdToProviderExternalId ? menuItemId : null) ??
      null,
  };
}

async function maybePublishProviderExternalId({
  catalogAdminProvider,
  input,
  mapping,
}: {
  catalogAdminProvider?: CatalogAdminProviderPort;
  input: UpsertCatalogMappingInput;
  mapping: MenuItemKitchenMapping;
}): Promise<CatalogProviderPublication | null> {
  if (input.publishProviderExternalId !== true || !catalogAdminProvider) {
    return null;
  }

  const support = catalogAdminProvider.getCatalogExternalIdSupport();

  if (support.mode !== "api_write") {
    return {
      providerItemId: mapping.providerItemId ?? "",
      externalId: mapping.providerExternalId ?? "",
      status: "skipped",
      providerMessage:
        "O provider atual não expõe publicação automática de external ID nesta integração.",
    };
  }

  if (!mapping.providerItemId || !mapping.providerExternalId) {
    return {
      providerItemId: mapping.providerItemId ?? "",
      externalId: mapping.providerExternalId ?? "",
      status: "skipped",
      providerMessage:
        "A publicação automática exige providerItemId e providerExternalId válidos.",
    };
  }

  const result = await catalogAdminProvider.publishExternalId({
    providerItemId: mapping.providerItemId,
    externalId: mapping.providerExternalId,
  });

  return {
    providerItemId: mapping.providerItemId,
    externalId: mapping.providerExternalId,
    status: result.status,
    providerMessage: result.providerMessage ?? null,
  };
}

function collectReplayTargets(
  exceptions: SyncExceptionRecord[],
  menuItemId: string,
) {
  const uniqueTargets = new Map<
    string,
    {
      provider: ProviderName;
      externalOrderId: string;
    }
  >();

  for (const exception of exceptions) {
    if (
      exception.kind !== "missing_mapping" ||
      typeof exception.externalOrderId !== "string"
    ) {
      continue;
    }

    if (readMissingMappingProviderExternalId(exception.details) !== menuItemId) {
      continue;
    }

    const key = `${exception.provider}:${exception.externalOrderId}`;

    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, {
        provider: exception.provider,
        externalOrderId: exception.externalOrderId,
      });
    }
  }

  return [...uniqueTargets.values()];
}

function readMissingMappingProviderExternalId(details: unknown) {
  const record = asRecord(details);

  if (
    typeof record?.providerExternalId === "string" &&
    record.providerExternalId.trim().length > 0
  ) {
    return record.providerExternalId.trim();
  }

  return typeof record?.menuItemId === "string" && record.menuItemId.trim().length > 0
    ? record.menuItemId.trim()
    : null;
}

function collectPendingProviderItems(
  snapshots: ProviderOrderSnapshot[],
  mappings: MenuItemKitchenMapping[],
): CatalogPendingProviderItem[] {
  const mappingsByProviderExternalId = new Map(
    mappings.map((mapping) => [
      mapping.providerExternalId ?? mapping.menuItemId,
      mapping,
    ]),
  );
  const mappingsByProviderItemId = new Map(
    mappings
      .filter((mapping) => typeof mapping.providerItemId === "string")
      .map((mapping) => [
        mapping.providerItemId as string,
        mapping,
      ]),
  );
  const observations = new Map<
    string,
    {
      providerExternalId: string | null;
      providerItemId: string | null;
      lastSeenAt: string;
      latestDescription: string | null;
      latestName: string;
      provider: ProviderName;
      sourceOrders: Map<
        string,
        {
          externalOrderId: string;
          reference: string;
          providerUpdatedAt: string;
        }
      >;
      status: "needs_mapping" | "missing_external_id";
      suggestedMenuItemId: string | null;
    }
  >();

  for (const snapshot of snapshots) {
    for (const item of snapshot.items) {
      if (
        item.catalogExternalId &&
        mappingsByProviderExternalId.has(item.catalogExternalId)
      ) {
        continue;
      }

      const normalizedName = item.name.trim();
      const existingByProviderItemId = item.providerItemId
        ? mappingsByProviderItemId.get(item.providerItemId)
        : undefined;
      const key = item.providerItemId
        ? `${snapshot.provider}:item:${item.providerItemId}`
        : item.catalogExternalId
        ? `${snapshot.provider}:external:${item.catalogExternalId}`
        : `${snapshot.provider}:missing:${normalizeLooseKey(normalizedName)}`;
      const existing = observations.get(key);

      if (!existing) {
        observations.set(key, {
          providerExternalId: item.catalogExternalId,
          providerItemId: item.providerItemId ?? null,
          lastSeenAt: snapshot.providerUpdatedAt,
          latestDescription: null,
          latestName: normalizedName,
          provider: snapshot.provider,
          sourceOrders: new Map([
            [
              snapshot.externalOrderId,
              {
                externalOrderId: snapshot.externalOrderId,
                reference: snapshot.reference,
                providerUpdatedAt: snapshot.providerUpdatedAt,
              },
            ],
          ]),
          status: item.catalogExternalId ? "needs_mapping" : "missing_external_id",
          suggestedMenuItemId:
            existingByProviderItemId?.menuItemId ?? item.catalogExternalId,
        });

        continue;
      }

      if (snapshot.providerUpdatedAt.localeCompare(existing.lastSeenAt) >= 0) {
        existing.lastSeenAt = snapshot.providerUpdatedAt;
        existing.latestName = normalizedName;
      }

      existing.providerItemId = existing.providerItemId ?? item.providerItemId ?? null;
      existing.providerExternalId =
        existing.providerExternalId ?? item.catalogExternalId;

      existing.sourceOrders.set(snapshot.externalOrderId, {
        externalOrderId: snapshot.externalOrderId,
        reference: snapshot.reference,
        providerUpdatedAt: snapshot.providerUpdatedAt,
      });
    }
  }

  return [...observations.entries()]
    .map(([key, observation]) => ({
      key,
      provider: observation.provider,
      providerItemId: observation.providerItemId,
      providerExternalId: observation.providerExternalId,
      suggestedMenuItemId: observation.suggestedMenuItemId,
      latestName: observation.latestName,
      latestDescription: observation.latestDescription,
      status: observation.status,
      lastSeenAt: observation.lastSeenAt,
      seenOrderCount: observation.sourceOrders.size,
      sourceOrders: [...observation.sourceOrders.values()]
        .sort((left, right) =>
          right.providerUpdatedAt.localeCompare(left.providerUpdatedAt),
        )
        .slice(0, 3),
    }))
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt));
}

function collectPendingProviderCatalogItems(
  catalogItems: ProviderCatalogItem[],
  mappings: MenuItemKitchenMapping[],
): CatalogPendingProviderItem[] {
  const mappingsByProviderExternalId = new Map(
    mappings.map((mapping) => [
      mapping.providerExternalId ?? mapping.menuItemId,
      mapping,
    ]),
  );
  const mappingsByProviderItemId = new Map(
    mappings
      .filter((mapping) => typeof mapping.providerItemId === "string")
      .map((mapping) => [
        mapping.providerItemId as string,
        mapping,
      ]),
  );
  const observations = new Map<string, CatalogPendingProviderItem>();

  for (const item of catalogItems) {
    if (mappingsByProviderItemId.has(item.providerItemId)) {
      continue;
    }

    if (
      item.providerExternalId &&
      mappingsByProviderExternalId.has(item.providerExternalId)
    ) {
      continue;
    }

    const existingByProviderItemId = mappingsByProviderItemId.get(
      item.providerItemId,
    );
    const key =
      item.providerItemId.trim().length > 0
        ? `${item.provider}:item:${item.providerItemId}`
        : item.providerExternalId
        ? `${item.provider}:external:${item.providerExternalId}`
        : `${item.provider}:missing:${normalizeLooseKey(item.name)}`;
    const existing = observations.get(key);

    if (!existing) {
      observations.set(key, {
        key,
        provider: item.provider,
        providerItemId: item.providerItemId,
        providerExternalId: item.providerExternalId,
        suggestedMenuItemId:
          existingByProviderItemId?.menuItemId ?? item.providerExternalId,
        latestName: item.name.trim(),
        latestDescription: normalizeOptionalCatalogDescription(item.description),
        status: item.providerExternalId ? "needs_mapping" : "missing_external_id",
        lastSeenAt: item.updatedAt,
        seenOrderCount: 0,
        sourceOrders: [],
      });

      continue;
    }

    if (item.updatedAt.localeCompare(existing.lastSeenAt) >= 0) {
      existing.lastSeenAt = item.updatedAt;
      existing.latestName = item.name.trim();
      existing.latestDescription =
        normalizeOptionalCatalogDescription(item.description) ??
        existing.latestDescription;
    }

    existing.providerExternalId =
      existing.providerExternalId ?? item.providerExternalId;
    existing.latestDescription =
      existing.latestDescription ??
      normalizeOptionalCatalogDescription(item.description);
  }

  return [...observations.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function mergeCatalogPendingProviderItems(
  ...groups: CatalogPendingProviderItem[][]
): CatalogPendingProviderItem[] {
  const merged = new Map<string, CatalogPendingProviderItem>();

  for (const group of groups) {
    for (const item of group) {
      const existing = merged.get(item.key);

      if (!existing) {
        merged.set(item.key, {
          ...item,
          sourceOrders: item.sourceOrders.map((order) => ({ ...order })),
        });
        continue;
      }

      if (item.lastSeenAt.localeCompare(existing.lastSeenAt) >= 0) {
        existing.lastSeenAt = item.lastSeenAt;
        existing.latestName = item.latestName;
        existing.latestDescription =
          item.latestDescription ?? existing.latestDescription;
        existing.status = item.status;
      }

      existing.providerItemId = existing.providerItemId ?? item.providerItemId;
      existing.providerExternalId =
        existing.providerExternalId ?? item.providerExternalId;
      existing.suggestedMenuItemId =
        existing.suggestedMenuItemId ?? item.suggestedMenuItemId;
      existing.latestDescription =
        existing.latestDescription ?? item.latestDescription;
      existing.seenOrderCount = Math.max(
        existing.seenOrderCount,
        item.seenOrderCount,
      );

      const sourceOrders = new Map(
        existing.sourceOrders.map((order) => [order.externalOrderId, order]),
      );

      for (const order of item.sourceOrders) {
        sourceOrders.set(order.externalOrderId, { ...order });
      }

      existing.sourceOrders = [...sourceOrders.values()]
        .sort((left, right) =>
          right.providerUpdatedAt.localeCompare(left.providerUpdatedAt),
        )
        .slice(0, 3);
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function normalizeRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`Invalid ${fieldName}`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function normalizeOptionalDateTime(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim();

  return Number.isNaN(Date.parse(normalized)) ? null : normalized;
}

function buildDefaultPullWindow() {
  return new Date(
    Date.now() - DEFAULT_PROVIDER_PULL_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
}

function normalizeLooseKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeOptionalCatalogDescription(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildProviderCatalogIndex(catalogItems: ProviderCatalogItem[]) {
  const byProviderExternalId = new Map<string, ProviderCatalogItem>();
  const byProviderItemId = new Map<string, ProviderCatalogItem>();

  for (const item of catalogItems) {
    if (item.providerItemId.trim().length > 0) {
      byProviderItemId.set(item.providerItemId, item);
    }

    if (item.providerExternalId?.trim()) {
      byProviderExternalId.set(item.providerExternalId, item);
    }
  }

  return {
    byProviderExternalId,
    byProviderItemId,
  };
}

function findProviderCatalogItemForMapping(
  mapping: MenuItemKitchenMapping,
  providerCatalogIndex: ReturnType<typeof buildProviderCatalogIndex>,
) {
  if (mapping.providerItemId) {
    const providerCatalogItem = providerCatalogIndex.byProviderItemId.get(
      mapping.providerItemId,
    );

    if (providerCatalogItem) {
      return providerCatalogItem;
    }
  }

  if (mapping.providerExternalId) {
    return providerCatalogIndex.byProviderExternalId.get(
      mapping.providerExternalId,
    );
  }

  return undefined;
}

function asRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
