import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";

import type {
  OrderProviderPort,
  ProductionRepository,
  ProviderSyncRepository,
} from "@/src/application/ports";
import type { CatalogMappingRepository } from "@/src/application/catalog-mapping-service";
import { syncOrders } from "@/src/application/order-sync-service";
import {
  kitchens,
  type Kitchen,
  type KitchenId,
  type KitchenTicketRecord,
  type MenuItemKitchenMapping,
  type OrderAggregate,
  type OrderItemRecord,
  type OrderRecord,
} from "@/src/domain/production";
import {
  parseProviderName,
  parseProviderOrderLifecycle,
  parseSyncTrigger,
  providerEventProcessStatuses,
  providerOrderLifecycles,
  syncExceptionKinds,
  syncExceptionStatuses,
  syncTriggers,
  syncRunStatuses,
  type ProviderCatalogItem,
  type ProviderEventRecord,
  type ProviderName,
  type ProviderOrderState,
  type SyncExceptionRecord,
  type SyncRunRecord,
} from "@/src/domain/provider-sync";
import type { SplitOrderResult } from "@/src/domain/split-order-service";
import {
  createMockOrderProvider,
  listMockKitchenMappings,
} from "@/src/infrastructure/mock-order-provider";
import { parseOrderSyncProviderMode } from "@/src/infrastructure/order-provider-factory";

type SqliteDatabase = InstanceType<typeof BetterSqlite3>;
export type SqliteProductionRepository = ProductionRepository &
  ProviderSyncRepository &
  CatalogMappingRepository;

export interface ProviderEventRow {
  id: string;
  provider: string;
  deliveryKey: string;
  eventType: string;
  externalOrderId: string | null;
  payloadJson: string;
  receivedAt: string;
  processedAt: string | null;
  processStatus: string;
  syncRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SyncRunRow {
  id: string;
  provider: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  candidateCount: number;
  importedCount: number;
  ignoredCount: number;
  exceptionCount: number;
  errorCount: number;
}

export interface ProviderOrderRow {
  provider: string;
  externalOrderId: string;
  providerStatus: string;
  lifecycle: string;
  snapshotHash: string;
  normalizedJson: string;
  lastSeenAt: string;
  lastAppliedAt: string | null;
  importedOrderId: string | null;
}

export interface ProviderCatalogItemRow {
  provider: string;
  providerItemId: string;
  providerExternalId: string | null;
  name: string;
  description: string | null;
  updatedAt: string;
  rawPayloadJson: string;
}

export interface SyncExceptionRow {
  id: string;
  provider: string;
  externalOrderId: string | null;
  orderId: string | null;
  sourceEventId: string | null;
  kind: string;
  status: string;
  summary: string;
  detailsJson: string;
  detectedAt: string;
  lastSeenAt: string;
  acknowledgedAt: string | null;
  acknowledgedVia: string | null;
  resolvedAt: string | null;
  resolvedVia: string | null;
  resolutionNote: string | null;
}

const DATA_DIRECTORY = path.join(process.cwd(), "data");
const DEFAULT_DATABASE_PATH = path.join(
  DATA_DIRECTORY,
  "bistro-production.sqlite",
);

function getConfiguredDatabasePath() {
  const configuredPath = process.env.BISTRO_DATABASE_PATH;

  if (!configuredPath) {
    return DEFAULT_DATABASE_PATH;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(/* turbopackIgnore: true */ process.cwd(), configuredPath);
}

let database: SqliteDatabase | undefined;
let repository: SqliteProductionRepository | undefined;

function createDatabase(databasePath: string) {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new BetterSqlite3(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return db;
}

function migrate(db: SqliteDatabase) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kitchens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS menu_item_kitchen_mappings (
      menu_item_id TEXT PRIMARY KEY,
      menu_item_name TEXT NOT NULL,
      kitchen_id TEXT NOT NULL REFERENCES kitchens(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      reference TEXT NOT NULL,
      customer_name TEXT,
      local_canceled_at TEXT,
      local_canceled_by_area_id TEXT,
      local_canceled_by_role TEXT,
      local_cancellation_reason TEXT,
      waiter_name TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kitchen_tickets (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
      started_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_id, kitchen_id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      external_item_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      kitchen_id TEXT NOT NULL REFERENCES kitchens(id),
      status TEXT NOT NULL CHECK(status IN ('new', 'in_preparation', 'ready')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(order_id, external_item_id)
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      trigger TEXT NOT NULL CHECK(trigger IN ('webhook', 'reconciliation', 'replay')),
      status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
      started_at TEXT NOT NULL,
      finished_at TEXT,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      imported_count INTEGER NOT NULL DEFAULT 0,
      ignored_count INTEGER NOT NULL DEFAULT 0,
      exception_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS provider_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      delivery_key TEXT NOT NULL,
      event_type TEXT NOT NULL,
      external_order_id TEXT,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      process_status TEXT NOT NULL CHECK(process_status IN ('received', 'processed', 'failed')),
      sync_run_id TEXT REFERENCES sync_runs(id),
      error_code TEXT,
      error_message TEXT,
      UNIQUE(provider, delivery_key)
    );

    CREATE TABLE IF NOT EXISTS provider_orders (
      provider TEXT NOT NULL,
      external_order_id TEXT NOT NULL,
      provider_status TEXT NOT NULL,
      lifecycle TEXT NOT NULL CHECK(lifecycle IN ('pending_confirmation', 'confirmed_ready', 'canceled')),
      snapshot_hash TEXT NOT NULL,
      normalized_json TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_applied_at TEXT,
      imported_order_id TEXT REFERENCES orders(id),
      PRIMARY KEY (provider, external_order_id)
    );

    CREATE TABLE IF NOT EXISTS provider_catalog_items (
      provider TEXT NOT NULL,
      provider_item_id TEXT NOT NULL,
      provider_external_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL,
      raw_payload_json TEXT NOT NULL,
      PRIMARY KEY (provider, provider_item_id)
    );

    CREATE TABLE IF NOT EXISTS order_sync_exceptions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_order_id TEXT,
      order_id TEXT REFERENCES orders(id),
      source_event_id TEXT REFERENCES provider_events(id),
      kind TEXT NOT NULL CHECK(kind IN ('missing_mapping', 'changed_externally', 'canceled_externally', 'ingestion_failed')),
      status TEXT NOT NULL CHECK(status IN ('open', 'acknowledged', 'resolved')),
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL,
      detected_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      acknowledged_at TEXT,
      acknowledged_via TEXT,
      resolved_at TEXT,
      resolved_via TEXT,
      resolution_note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_provider_events_external_order_id
      ON provider_events(provider, external_order_id);
    CREATE INDEX IF NOT EXISTS idx_provider_events_sync_run_id
      ON provider_events(sync_run_id);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_provider_started_at
      ON sync_runs(provider, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_provider_orders_imported_order_id
      ON provider_orders(imported_order_id);
    CREATE INDEX IF NOT EXISTS idx_provider_catalog_items_provider_external_id
      ON provider_catalog_items(provider, provider_external_id);
    CREATE INDEX IF NOT EXISTS idx_provider_catalog_items_updated_at
      ON provider_catalog_items(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_sync_exceptions_status_order
      ON order_sync_exceptions(status, order_id, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_sync_exceptions_provider_lookup
      ON order_sync_exceptions(provider, kind, external_order_id, order_id, last_seen_at DESC);
  `);

  ensureProviderMappingColumns(db);
  ensureProviderCatalogItemColumns(db);
  ensureOrderMetadataColumns(db);
  ensureKitchenTicketMetadataColumns(db);
}

function ensureProviderMappingColumns(db: SqliteDatabase) {
  const columns = db
    .prepare("PRAGMA table_info(menu_item_kitchen_mappings)")
    .all() as Array<{ name: string }>;
  const hasProviderCatalogId = columns.some(
    (column) => column.name === "provider_catalog_id",
  );
  const hasProviderItemId = columns.some(
    (column) => column.name === "provider_item_id",
  );
  const hasProviderExternalId = columns.some(
    (column) => column.name === "provider_external_id",
  );

  if (!hasProviderCatalogId) {
    db.exec(`
      ALTER TABLE menu_item_kitchen_mappings
      ADD COLUMN provider_catalog_id TEXT
    `);
  }

  if (!hasProviderItemId) {
    db.exec(`
      ALTER TABLE menu_item_kitchen_mappings
      ADD COLUMN provider_item_id TEXT
    `);
  }

  if (!hasProviderExternalId) {
    db.exec(`
      ALTER TABLE menu_item_kitchen_mappings
      ADD COLUMN provider_external_id TEXT
    `);
  }

  db.exec(`
    UPDATE menu_item_kitchen_mappings
    SET provider_external_id = provider_catalog_id
    WHERE provider_external_id IS NULL
      AND provider_catalog_id IS NOT NULL
  `);

  collapseDuplicateMenuItemMappings(db);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_kitchen_mappings_provider_catalog_id
      ON menu_item_kitchen_mappings(provider_catalog_id)
      WHERE provider_catalog_id IS NOT NULL
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_kitchen_mappings_provider_item_id
      ON menu_item_kitchen_mappings(provider_item_id)
      WHERE provider_item_id IS NOT NULL
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_kitchen_mappings_provider_external_id
      ON menu_item_kitchen_mappings(provider_external_id)
      WHERE provider_external_id IS NOT NULL
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_item_kitchen_mappings_menu_item_name
      ON menu_item_kitchen_mappings(menu_item_name COLLATE NOCASE)
  `);

}

function ensureProviderCatalogItemColumns(db: SqliteDatabase) {
  const columns = db
    .prepare("PRAGMA table_info(provider_catalog_items)")
    .all() as Array<{ name: string }>;
  const hasDescription = columns.some((column) => column.name === "description");

  if (!hasDescription) {
    db.exec(`
      ALTER TABLE provider_catalog_items
      ADD COLUMN description TEXT
    `);
  }
}

function ensureOrderMetadataColumns(db: SqliteDatabase) {
  const columns = db
    .prepare("PRAGMA table_info(orders)")
    .all() as Array<{ name: string }>;
  const hasLocalCanceledAt = columns.some(
    (column) => column.name === "local_canceled_at",
  );
  const hasLocalCanceledByAreaId = columns.some(
    (column) => column.name === "local_canceled_by_area_id",
  );
  const hasLocalCanceledByRole = columns.some(
    (column) => column.name === "local_canceled_by_role",
  );
  const hasLocalCancellationReason = columns.some(
    (column) => column.name === "local_cancellation_reason",
  );
  const hasWaiterName = columns.some((column) => column.name === "waiter_name");

  if (!hasLocalCanceledAt) {
    db.exec(`
      ALTER TABLE orders
      ADD COLUMN local_canceled_at TEXT
    `);
  }

  if (!hasLocalCanceledByAreaId) {
    db.exec(`
      ALTER TABLE orders
      ADD COLUMN local_canceled_by_area_id TEXT
    `);
  }

  if (!hasLocalCanceledByRole) {
    db.exec(`
      ALTER TABLE orders
      ADD COLUMN local_canceled_by_role TEXT
    `);
  }

  if (!hasLocalCancellationReason) {
    db.exec(`
      ALTER TABLE orders
      ADD COLUMN local_cancellation_reason TEXT
    `);
  }

  if (!hasWaiterName) {
    db.exec(`
      ALTER TABLE orders
      ADD COLUMN waiter_name TEXT
    `);
  }
}

function ensureKitchenTicketMetadataColumns(db: SqliteDatabase) {
  const columns = db
    .prepare("PRAGMA table_info(kitchen_tickets)")
    .all() as Array<{ name: string }>;
  const hasStartedAt = columns.some((column) => column.name === "started_at");

  if (!hasStartedAt) {
    db.exec(`
      ALTER TABLE kitchen_tickets
      ADD COLUMN started_at TEXT
    `);
  }
}

interface MappingRow {
  rowId: number;
  menuItemId: string;
  menuItemName: string;
  kitchenId: string;
  providerItemId: string | null;
  providerExternalId: string | null;
}

function collapseDuplicateMenuItemMappings(db: SqliteDatabase) {
  collapseDuplicateMenuItemMappingsByKey(
    db,
    (row) => normalizeMappingNameKey(row.menuItemName),
  );
  collapseDuplicateMenuItemMappingsByKey(db, (row) => row.providerItemId);
  collapseDuplicateMenuItemMappingsByKey(db, (row) => row.providerExternalId);
}

function collapseDuplicateMenuItemMappingsByKey(
  db: SqliteDatabase,
  readKey: (row: MappingRow) => string | null,
) {
  const rows = db
    .prepare(
      `
        SELECT
          rowid as rowId,
          menu_item_id as menuItemId,
          menu_item_name as menuItemName,
          kitchen_id as kitchenId,
          provider_item_id as providerItemId,
          provider_external_id as providerExternalId
        FROM menu_item_kitchen_mappings
        ORDER BY rowid ASC
      `,
    )
    .all() as MappingRow[];
  const groups = new Map<string, MappingRow[]>();

  for (const row of rows) {
    const key = readKey(row);

    if (!key) {
      continue;
    }

    const normalizedKey = key.trim();

    if (normalizedKey.length === 0) {
      continue;
    }

    const group = groups.get(normalizedKey) ?? [];
    group.push(row);
    groups.set(normalizedKey, group);
  }

  const merge = db.transaction((duplicates: MappingRow[]) => {
    if (duplicates.length <= 1) {
      return;
    }

    const canonical = chooseCanonicalMappingRow(duplicates);
    const mergedProviderItemId = firstNonBlankString(
      duplicates.map((row) => row.providerItemId),
    );
    const mergedProviderExternalId = firstNonBlankString(
      duplicates.map((row) => row.providerExternalId),
    );

    db.prepare(
      `
        UPDATE menu_item_kitchen_mappings
        SET
          menu_item_name = @menuItemName,
          kitchen_id = @kitchenId,
          provider_item_id = @providerItemId,
          provider_external_id = @providerExternalId
        WHERE menu_item_id = @menuItemId
      `,
    ).run({
      menuItemId: canonical.menuItemId,
      menuItemName: canonical.menuItemName,
      kitchenId: canonical.kitchenId,
      providerItemId: mergedProviderItemId,
      providerExternalId: mergedProviderExternalId,
    });

    for (const row of duplicates) {
      if (row.menuItemId === canonical.menuItemId) {
        continue;
      }

      db.prepare(
        `
          UPDATE order_items
          SET menu_item_id = ?
          WHERE menu_item_id = ?
        `,
      ).run(canonical.menuItemId, row.menuItemId);

      db.prepare(
        `
          DELETE FROM menu_item_kitchen_mappings
          WHERE menu_item_id = ?
        `,
      ).run(row.menuItemId);
    }
  });

  for (const duplicates of groups.values()) {
    if (duplicates.length > 1) {
      merge(duplicates);
    }
  }
}

function chooseCanonicalMappingRow(rows: MappingRow[]) {
  return [...rows].sort((left, right) => {
    const leftScore = scoreMappingRow(left);
    const rightScore = scoreMappingRow(right);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.rowId - right.rowId;
  })[0]!;
}

function scoreMappingRow(row: MappingRow) {
  let score = 0;

  if (typeof row.providerItemId === "string" && row.providerItemId.trim().length > 0) {
    score += 2;
  }

  if (
    typeof row.providerExternalId === "string" &&
    row.providerExternalId.trim().length > 0
  ) {
    score += 1;
  }

  return score;
}

function firstNonBlankString(values: Array<string | null>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeMappingNameKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function seedStaticData(
  db: SqliteDatabase,
  initialKitchenMappings: readonly MenuItemKitchenMapping[] = [],
) {
  const insertKitchen = db.prepare(`
    INSERT INTO kitchens (id, name, description)
    VALUES (@id, @name, @description)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description
  `);

  const insertMapping = db.prepare(`
    INSERT INTO menu_item_kitchen_mappings (
      menu_item_id,
      menu_item_name,
      kitchen_id,
      provider_item_id,
      provider_external_id
    )
    VALUES (
      @menuItemId,
      @menuItemName,
      @kitchenId,
      @providerItemId,
      @providerExternalId
    )
    ON CONFLICT(menu_item_id) DO UPDATE SET
      menu_item_name = excluded.menu_item_name,
      kitchen_id = excluded.kitchen_id,
      provider_item_id = COALESCE(
        excluded.provider_item_id,
        menu_item_kitchen_mappings.provider_item_id
      ),
      provider_external_id = COALESCE(
        excluded.provider_external_id,
        menu_item_kitchen_mappings.provider_external_id
      )
  `);

  const seed = db.transaction(() => {
    for (const kitchen of kitchens) {
      insertKitchen.run(kitchen);
    }

    for (const mapping of initialKitchenMappings) {
      insertMapping.run({
        ...mapping,
        providerItemId: mapping.providerItemId ?? null,
        providerExternalId: mapping.providerExternalId ?? null,
      });
    }
  });

  seed();
}

function loadAggregateRows(db: SqliteDatabase) {
  const orders = db
    .prepare(
      `
        SELECT
          id,
          external_id as externalId,
          reference,
          customer_name as customerName,
          local_canceled_at as localCanceledAt,
          local_canceled_by_area_id as localCanceledByAreaId,
          local_canceled_by_role as localCanceledByRole,
          local_cancellation_reason as localCancellationReason,
          waiter_name as waiterName,
          source,
          created_at as createdAt,
          updated_at as updatedAt
        FROM orders
        ORDER BY created_at ASC
      `,
    )
    .all() as OrderRecord[];

  const tickets = db
    .prepare(
      `
        SELECT
          id,
          order_id as orderId,
          kitchen_id as kitchenId,
          started_at as startedAt,
          created_at as createdAt,
          updated_at as updatedAt
        FROM kitchen_tickets
      `,
    )
    .all() as KitchenTicketRecord[];

  const items = db
    .prepare(
      `
        SELECT
          id,
          order_id as orderId,
          external_item_id as externalItemId,
          menu_item_id as menuItemId,
          name,
          quantity,
          notes,
          kitchen_id as kitchenId,
          status,
          created_at as createdAt,
          updated_at as updatedAt
        FROM order_items
      `,
    )
    .all() as OrderItemRecord[];

  return { orders, tickets, items };
}

function requireProviderName(value: string | null | undefined): ProviderName {
  const provider = parseProviderName(value);

  if (!provider) {
    throw new TypeError(
      `Unsupported provider value "${value ?? "null"}" found in SQLite sync row`,
    );
  }

  return provider;
}

function requireLiteralValue<T extends string>(
  value: string | null | undefined,
  allowedValues: readonly T[],
  fieldName: string,
): T {
  if (
    typeof value === "string" &&
    (allowedValues as readonly string[]).includes(value)
  ) {
    return value as T;
  }

  throw new TypeError(
    `Unsupported ${fieldName} value "${value ?? "null"}" found in SQLite sync row`,
  );
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function deserializeJson<T>(value: string) {
  return JSON.parse(value) as T;
}

export function mapProviderEventRow(row: ProviderEventRow): ProviderEventRecord {
  return {
    id: row.id,
    provider: requireProviderName(row.provider),
    deliveryKey: row.deliveryKey,
    eventType: row.eventType,
    externalOrderId: row.externalOrderId,
    payload: deserializeJson(row.payloadJson),
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    processStatus: requireLiteralValue(
      row.processStatus,
      providerEventProcessStatuses,
      "provider event process status",
    ),
    syncRunId: row.syncRunId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
  };
}

export function mapSyncRunRow(row: SyncRunRow): SyncRunRecord {
  return {
    id: row.id,
    provider: requireProviderName(row.provider),
    trigger:
      parseSyncTrigger(row.trigger) ??
      requireLiteralValue(row.trigger, syncTriggers, "sync trigger"),
    status: requireLiteralValue(
      row.status,
      syncRunStatuses,
      "sync run status",
    ),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    candidateCount: row.candidateCount,
    importedCount: row.importedCount,
    ignoredCount: row.ignoredCount,
    exceptionCount: row.exceptionCount,
    errorCount: row.errorCount,
  };
}

export function mapProviderOrderRow(row: ProviderOrderRow): ProviderOrderState {
  return {
    provider: requireProviderName(row.provider),
    externalOrderId: row.externalOrderId,
    providerStatus: row.providerStatus,
    lifecycle:
      parseProviderOrderLifecycle(row.lifecycle) ??
      requireLiteralValue(
        row.lifecycle,
        providerOrderLifecycles,
        "provider order lifecycle",
      ),
    snapshotHash: row.snapshotHash,
    snapshot: deserializeJson<ProviderOrderState["snapshot"]>(row.normalizedJson),
    lastSeenAt: row.lastSeenAt,
    lastAppliedAt: row.lastAppliedAt,
    importedOrderId: row.importedOrderId,
  };
}

export function mapProviderCatalogItemRow(
  row: ProviderCatalogItemRow,
): ProviderCatalogItem {
  return {
    provider: requireProviderName(row.provider),
    providerItemId: row.providerItemId,
    providerExternalId: row.providerExternalId,
    name: row.name,
    description: row.description,
    updatedAt: row.updatedAt,
    rawPayload: deserializeJson(row.rawPayloadJson),
  };
}

export function mapSyncExceptionRow(
  row: SyncExceptionRow,
): SyncExceptionRecord {
  return {
    id: row.id,
    provider: requireProviderName(row.provider),
    externalOrderId: row.externalOrderId,
    orderId: row.orderId,
    sourceEventId: row.sourceEventId,
    kind: requireLiteralValue(
      row.kind,
      syncExceptionKinds,
      "sync exception kind",
    ),
    status: requireLiteralValue(
      row.status,
      syncExceptionStatuses,
      "sync exception status",
    ),
    summary: row.summary,
    details: deserializeJson(row.detailsJson),
    detectedAt: row.detectedAt,
    lastSeenAt: row.lastSeenAt,
    acknowledgedAt: row.acknowledgedAt,
    acknowledgedVia: row.acknowledgedVia,
    resolvedAt: row.resolvedAt,
    resolvedVia: row.resolvedVia,
    resolutionNote: row.resolutionNote,
  };
}

function createProductionRepository(db: SqliteDatabase): SqliteProductionRepository {
  const upsertKitchenMappingStatement = db.prepare(`
    INSERT INTO menu_item_kitchen_mappings (
      menu_item_id,
      menu_item_name,
      kitchen_id,
      provider_item_id,
      provider_external_id
    )
    VALUES (
      @menuItemId,
      @menuItemName,
      @kitchenId,
      @providerItemId,
      @providerExternalId
    )
    ON CONFLICT(menu_item_id) DO UPDATE SET
      menu_item_name = excluded.menu_item_name,
      kitchen_id = excluded.kitchen_id,
      provider_item_id = COALESCE(
        excluded.provider_item_id,
        menu_item_kitchen_mappings.provider_item_id
      ),
      provider_external_id = COALESCE(
        excluded.provider_external_id,
        menu_item_kitchen_mappings.provider_external_id
      )
  `);

  const selectAllProviderCatalogItems = db.prepare(`
    SELECT
      provider,
      provider_item_id as providerItemId,
      provider_external_id as providerExternalId,
      name,
      description,
      updated_at as updatedAt,
      raw_payload_json as rawPayloadJson
    FROM provider_catalog_items
    ORDER BY updated_at DESC, name ASC
  `);

  const upsertProviderCatalogItemStatement = db.prepare(`
    INSERT INTO provider_catalog_items (
      provider,
      provider_item_id,
      provider_external_id,
      name,
      description,
      updated_at,
      raw_payload_json
    )
    VALUES (
      @provider,
      @providerItemId,
      @providerExternalId,
      @name,
      @description,
      @updatedAt,
      @rawPayloadJson
    )
    ON CONFLICT(provider, provider_item_id) DO UPDATE SET
      provider_external_id = excluded.provider_external_id,
      name = excluded.name,
      description = excluded.description,
      updated_at = excluded.updated_at,
      raw_payload_json = excluded.raw_payload_json
  `);

  const persistProviderCatalogItems = db.transaction(
    (items: ProviderCatalogItem[]) => {
      for (const item of items) {
        upsertProviderCatalogItemStatement.run({
          provider: item.provider,
          providerItemId: item.providerItemId,
          providerExternalId: item.providerExternalId ?? null,
          name: item.name,
          description: item.description ?? null,
          updatedAt: item.updatedAt,
          rawPayloadJson: serializeJson(item.rawPayload),
        });
      }
    },
  );

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id,
      external_id,
      reference,
      customer_name,
      local_canceled_at,
      local_canceled_by_area_id,
      local_canceled_by_role,
      local_cancellation_reason,
      waiter_name,
      source,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @externalId,
      @reference,
      @customerName,
      NULL,
      NULL,
      NULL,
      NULL,
      @waiterName,
      @source,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const insertTicket = db.prepare(`
    INSERT INTO kitchen_tickets (
      id,
      order_id,
      kitchen_id,
      started_at,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @orderId,
      @kitchenId,
      @startedAt,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const insertItem = db.prepare(`
    INSERT INTO order_items (
      id,
      order_id,
      external_item_id,
      menu_item_id,
      name,
      quantity,
      notes,
      kitchen_id,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @orderId,
      @externalItemId,
      @menuItemId,
      @name,
      @quantity,
      @notes,
      @kitchenId,
      @status,
      @createdAt,
      @updatedAt
    )
    ON CONFLICT(id) DO NOTHING
  `);

  const persistImportedOrder = db.transaction((payload: SplitOrderResult) => {
    insertOrder.run(payload.order);

    for (const ticket of payload.tickets) {
      insertTicket.run(ticket);
    }

    for (const item of payload.items) {
      insertItem.run(item);
    }
  });

  const touchTicketAndOrder = db.transaction(
    (orderId: string, kitchenId?: KitchenId) => {
      const timestamp = new Date().toISOString();

      db.prepare(
        `
          UPDATE orders
          SET updated_at = ?
          WHERE id = ?
        `,
      ).run(timestamp, orderId);

      if (kitchenId) {
        db.prepare(
          `
            UPDATE kitchen_tickets
            SET updated_at = ?
            WHERE order_id = ? AND kitchen_id = ?
          `,
        ).run(timestamp, orderId, kitchenId);
      }
    },
  );

  const insertProviderEvent = db.prepare(`
    INSERT INTO provider_events (
      id,
      provider,
      delivery_key,
      event_type,
      external_order_id,
      payload_json,
      received_at,
      processed_at,
      process_status,
      sync_run_id,
      error_code,
      error_message
    )
    VALUES (
      @id,
      @provider,
      @deliveryKey,
      @eventType,
      @externalOrderId,
      @payloadJson,
      @receivedAt,
      NULL,
      'received',
      NULL,
      NULL,
      NULL
    )
  `);

  const selectProviderEventById = db.prepare(`
    SELECT
      id,
      provider,
      delivery_key as deliveryKey,
      event_type as eventType,
      external_order_id as externalOrderId,
      payload_json as payloadJson,
      received_at as receivedAt,
      processed_at as processedAt,
      process_status as processStatus,
      sync_run_id as syncRunId,
      error_code as errorCode,
      error_message as errorMessage
    FROM provider_events
    WHERE id = ?
  `);

  const selectProviderEventByDeliveryKey = db.prepare(`
    SELECT
      id,
      provider,
      delivery_key as deliveryKey,
      event_type as eventType,
      external_order_id as externalOrderId,
      payload_json as payloadJson,
      received_at as receivedAt,
      processed_at as processedAt,
      process_status as processStatus,
      sync_run_id as syncRunId,
      error_code as errorCode,
      error_message as errorMessage
    FROM provider_events
    WHERE provider = @provider AND delivery_key = @deliveryKey
  `);

  const insertSyncRun = db.prepare(`
    INSERT INTO sync_runs (
      id,
      provider,
      trigger,
      status,
      started_at,
      finished_at,
      candidate_count,
      imported_count,
      ignored_count,
      exception_count,
      error_count
    )
    VALUES (
      @id,
      @provider,
      @trigger,
      'running',
      @startedAt,
      NULL,
      @candidateCount,
      0,
      0,
      0,
      0
    )
  `);

  const selectSyncRunById = db.prepare(`
    SELECT
      id,
      provider,
      trigger,
      status,
      started_at as startedAt,
      finished_at as finishedAt,
      candidate_count as candidateCount,
      imported_count as importedCount,
      ignored_count as ignoredCount,
      exception_count as exceptionCount,
      error_count as errorCount
    FROM sync_runs
    WHERE id = ?
  `);

  const assignSyncRunToEvent = db.prepare(`
    UPDATE provider_events
    SET sync_run_id = @syncRunId
    WHERE id = @eventId
  `);

  const finishSyncRunStatement = db.prepare(`
    UPDATE sync_runs
    SET
      status = @status,
      finished_at = @finishedAt,
      candidate_count = COALESCE(@candidateCount, candidate_count),
      imported_count = COALESCE(@importedCount, imported_count),
      ignored_count = COALESCE(@ignoredCount, ignored_count),
      exception_count = COALESCE(@exceptionCount, exception_count),
      error_count = COALESCE(@errorCount, error_count)
    WHERE id = @syncRunId
  `);

  const finishSyncEventStatement = db.prepare(`
    UPDATE provider_events
    SET
      process_status = @processStatus,
      processed_at = @processedAt,
      sync_run_id = @syncRunId,
      error_code = @errorCode,
      error_message = @errorMessage
    WHERE id = @eventId
  `);

  const selectProviderOrderByReference = db.prepare(`
    SELECT
      provider,
      external_order_id as externalOrderId,
      provider_status as providerStatus,
      lifecycle,
      snapshot_hash as snapshotHash,
      normalized_json as normalizedJson,
      last_seen_at as lastSeenAt,
      last_applied_at as lastAppliedAt,
      imported_order_id as importedOrderId
    FROM provider_orders
    WHERE provider = @provider AND external_order_id = @externalOrderId
  `);

  const selectAllProviderOrders = db.prepare(`
    SELECT
      provider,
      external_order_id as externalOrderId,
      provider_status as providerStatus,
      lifecycle,
      snapshot_hash as snapshotHash,
      normalized_json as normalizedJson,
      last_seen_at as lastSeenAt,
      last_applied_at as lastAppliedAt,
      imported_order_id as importedOrderId
    FROM provider_orders
    ORDER BY last_seen_at DESC, external_order_id ASC
  `);

  const upsertProviderOrderStatement = db.prepare(`
    INSERT INTO provider_orders (
      provider,
      external_order_id,
      provider_status,
      lifecycle,
      snapshot_hash,
      normalized_json,
      last_seen_at,
      last_applied_at,
      imported_order_id
    )
    VALUES (
      @provider,
      @externalOrderId,
      @providerStatus,
      @lifecycle,
      @snapshotHash,
      @normalizedJson,
      @lastSeenAt,
      @lastAppliedAt,
      @importedOrderId
    )
    ON CONFLICT(provider, external_order_id) DO UPDATE SET
      provider_status = excluded.provider_status,
      lifecycle = excluded.lifecycle,
      snapshot_hash = excluded.snapshot_hash,
      normalized_json = excluded.normalized_json,
      last_seen_at = excluded.last_seen_at,
      last_applied_at = excluded.last_applied_at,
      imported_order_id = excluded.imported_order_id
  `);

  const selectMatchingUnresolvedException = db.prepare(`
    SELECT
      id,
      provider,
      external_order_id as externalOrderId,
      order_id as orderId,
      source_event_id as sourceEventId,
      kind,
      status,
      summary,
      details_json as detailsJson,
      detected_at as detectedAt,
      last_seen_at as lastSeenAt,
      acknowledged_at as acknowledgedAt,
      acknowledged_via as acknowledgedVia,
      resolved_at as resolvedAt,
      resolved_via as resolvedVia,
      resolution_note as resolutionNote
    FROM order_sync_exceptions
    WHERE provider = @provider
      AND kind = @kind
      AND (
        (external_order_id = @externalOrderId)
        OR (external_order_id IS NULL AND @externalOrderId IS NULL)
      )
      AND (
        (order_id = @orderId)
        OR (order_id IS NULL AND @orderId IS NULL)
      )
      AND status != 'resolved'
    ORDER BY last_seen_at DESC, detected_at DESC
    LIMIT 1
  `);

  const insertSyncException = db.prepare(`
    INSERT INTO order_sync_exceptions (
      id,
      provider,
      external_order_id,
      order_id,
      source_event_id,
      kind,
      status,
      summary,
      details_json,
      detected_at,
      last_seen_at,
      acknowledged_at,
      acknowledged_via,
      resolved_at,
      resolved_via,
      resolution_note
    )
    VALUES (
      @id,
      @provider,
      @externalOrderId,
      @orderId,
      @sourceEventId,
      @kind,
      'open',
      @summary,
      @detailsJson,
      @detectedAt,
      @lastSeenAt,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
  `);

  const refreshSyncException = db.prepare(`
    UPDATE order_sync_exceptions
    SET
      source_event_id = @sourceEventId,
      summary = @summary,
      details_json = @detailsJson,
      last_seen_at = @lastSeenAt
    WHERE id = @id
  `);

  const selectSyncExceptionById = db.prepare(`
    SELECT
      id,
      provider,
      external_order_id as externalOrderId,
      order_id as orderId,
      source_event_id as sourceEventId,
      kind,
      status,
      summary,
      details_json as detailsJson,
      detected_at as detectedAt,
      last_seen_at as lastSeenAt,
      acknowledged_at as acknowledgedAt,
      acknowledged_via as acknowledgedVia,
      resolved_at as resolvedAt,
      resolved_via as resolvedVia,
      resolution_note as resolutionNote
    FROM order_sync_exceptions
    WHERE id = ?
  `);

  const acknowledgeSyncExceptionStatement = db.prepare(`
    UPDATE order_sync_exceptions
    SET
      status = 'acknowledged',
      acknowledged_at = @acknowledgedAt,
      acknowledged_via = @acknowledgedVia,
      resolution_note = COALESCE(@resolutionNote, resolution_note)
    WHERE id = @exceptionId
      AND order_id = @orderId
      AND status = 'open'
  `);

  const resolveSyncExceptionStatement = db.prepare(`
    UPDATE order_sync_exceptions
    SET
      status = 'resolved',
      resolved_at = @resolvedAt,
      resolved_via = @resolvedVia,
      resolution_note = COALESCE(@resolutionNote, resolution_note)
    WHERE provider = @provider
      AND kind = @kind
      AND (
        (external_order_id = @externalOrderId)
        OR (external_order_id IS NULL AND @externalOrderId IS NULL)
      )
      AND (
        (order_id = @orderId)
        OR (order_id IS NULL AND @orderId IS NULL)
      )
      AND status != 'resolved'
  `);

  const selectUnresolvedExceptions = db.prepare(`
    SELECT
      id,
      provider,
      external_order_id as externalOrderId,
      order_id as orderId,
      source_event_id as sourceEventId,
      kind,
      status,
      summary,
      details_json as detailsJson,
      detected_at as detectedAt,
      last_seen_at as lastSeenAt,
      acknowledged_at as acknowledgedAt,
      acknowledged_via as acknowledgedVia,
      resolved_at as resolvedAt,
      resolved_via as resolvedVia,
      resolution_note as resolutionNote
    FROM order_sync_exceptions
    WHERE status != 'resolved'
    ORDER BY last_seen_at DESC, detected_at DESC
  `);

  const selectUnresolvedExceptionForOrder = db.prepare(`
    SELECT
      id,
      provider,
      external_order_id as externalOrderId,
      order_id as orderId,
      source_event_id as sourceEventId,
      kind,
      status,
      summary,
      details_json as detailsJson,
      detected_at as detectedAt,
      last_seen_at as lastSeenAt,
      acknowledged_at as acknowledgedAt,
      acknowledged_via as acknowledgedVia,
      resolved_at as resolvedAt,
      resolved_via as resolvedVia,
      resolution_note as resolutionNote
    FROM order_sync_exceptions
    WHERE order_id = ? AND status != 'resolved'
    ORDER BY last_seen_at DESC, detected_at DESC
    LIMIT 1
  `);

  const selectSyncExceptionsForOrder = db.prepare(`
    SELECT
      id,
      provider,
      external_order_id as externalOrderId,
      order_id as orderId,
      source_event_id as sourceEventId,
      kind,
      status,
      summary,
      details_json as detailsJson,
      detected_at as detectedAt,
      last_seen_at as lastSeenAt,
      acknowledged_at as acknowledgedAt,
      acknowledged_via as acknowledgedVia,
      resolved_at as resolvedAt,
      resolved_via as resolvedVia,
      resolution_note as resolutionNote
    FROM order_sync_exceptions
    WHERE order_id = ?
    ORDER BY detected_at DESC, last_seen_at DESC
  `);

  const runAtomicWork = db.transaction((work: () => unknown) => work());

  return {
    listKitchens() {
      return db
        .prepare(
          `
            SELECT id, name, description
            FROM kitchens
            ORDER BY id ASC
          `,
        )
        .all() as Kitchen[];
    },
    listKitchenMappings() {
      return db
        .prepare(
          `
            SELECT
              menu_item_id as menuItemId,
              menu_item_name as menuItemName,
              kitchen_id as kitchenId,
              provider_item_id as providerItemId,
              provider_external_id as providerExternalId
            FROM menu_item_kitchen_mappings
            ORDER BY menu_item_name ASC
          `,
        )
        .all() as MenuItemKitchenMapping[];
    },
    upsertKitchenMapping(mapping) {
      upsertKitchenMappingStatement.run({
        ...mapping,
        providerItemId: mapping.providerItemId ?? null,
        providerExternalId: mapping.providerExternalId ?? null,
      });
    },
    listProviderCatalogItems() {
      return (
        selectAllProviderCatalogItems.all() as ProviderCatalogItemRow[]
      ).map(mapProviderCatalogItemRow);
    },
    upsertProviderCatalogItems(items) {
      persistProviderCatalogItems(items);
    },
    listImportedExternalOrderIds() {
      const rows = db
        .prepare(
          `
            SELECT external_id as externalId
            FROM orders
          `,
        )
        .all() as Array<{ externalId: string }>;

      return rows.map((row) => row.externalId);
    },
    saveImportedOrder(order) {
      persistImportedOrder(order);
    },
    listOrderAggregates() {
      const { orders, tickets, items } = loadAggregateRows(db);

      return orders.map<OrderAggregate>((order) => ({
        order,
        tickets: tickets.filter((ticket) => ticket.orderId === order.id),
        items: items.filter((item) => item.orderId === order.id),
      }));
    },
    getOrderAggregate(orderId: string) {
      return this.listOrderAggregates().find((aggregate) => aggregate.order.id === orderId);
    },
    cancelOrderLocally(orderId, input) {
      const timestamp = new Date().toISOString();
      const normalizedReason = input.reason.trim();
      const result = db
        .prepare(
          `
            UPDATE orders
            SET
              local_canceled_at = ?,
              local_canceled_by_area_id = ?,
              local_canceled_by_role = ?,
              local_cancellation_reason = ?,
              updated_at = ?
            WHERE id = ?
          `,
        )
        .run(
          timestamp,
          input.canceledByAreaId,
          input.canceledByRole,
          normalizedReason,
          timestamp,
          orderId,
        );

      if (result.changes === 0) {
        throw new Error(`Order "${orderId}" not found`);
      }

      return this.getOrderAggregate(orderId)!;
    },
    updateItemStatus(orderId, itemId, status) {
      const timestamp = new Date().toISOString();
      const result = db
        .prepare(
          `
            UPDATE order_items
            SET status = ?, updated_at = ?
            WHERE id = ? AND order_id = ?
          `,
        )
        .run(status, timestamp, itemId, orderId);

      if (result.changes === 0) {
        throw new Error(`Order item "${itemId}" not found`);
      }

      const kitchenId = db
        .prepare(
          `
            SELECT kitchen_id as kitchenId
            FROM order_items
            WHERE id = ?
          `,
        )
        .get(itemId) as { kitchenId: KitchenId } | undefined;

      if (kitchenId?.kitchenId) {
        if (status === "new") {
          const activeItems = db
            .prepare(
              `
                SELECT COUNT(*) as total
                FROM order_items
                WHERE order_id = ? AND kitchen_id = ? AND status <> 'new'
              `,
            )
            .get(orderId, kitchenId.kitchenId) as { total: number };

          if (activeItems.total === 0) {
            db.prepare(
              `
                UPDATE kitchen_tickets
                SET started_at = NULL, updated_at = ?
                WHERE order_id = ? AND kitchen_id = ?
              `,
            ).run(timestamp, orderId, kitchenId.kitchenId);
          }
        } else {
          db.prepare(
            `
              UPDATE kitchen_tickets
              SET started_at = COALESCE(started_at, ?), updated_at = ?
              WHERE order_id = ? AND kitchen_id = ?
            `,
          ).run(timestamp, timestamp, orderId, kitchenId.kitchenId);
        }
      }

      touchTicketAndOrder(orderId, kitchenId?.kitchenId);
      return this.getOrderAggregate(orderId)!;
    },
    startKitchenTicket(orderId, kitchenId) {
      const timestamp = new Date().toISOString();
      db.prepare(
        `
          UPDATE kitchen_tickets
          SET started_at = COALESCE(started_at, ?), updated_at = ?
          WHERE order_id = ? AND kitchen_id = ?
        `,
      ).run(timestamp, timestamp, orderId, kitchenId);

      touchTicketAndOrder(orderId, kitchenId);
      return this.getOrderAggregate(orderId)!;
    },
    completeKitchenTicket(orderId, kitchenId) {
      const timestamp = new Date().toISOString();
      db.prepare(
        `
          UPDATE kitchen_tickets
          SET started_at = COALESCE(started_at, ?), updated_at = ?
          WHERE order_id = ? AND kitchen_id = ?
        `,
      ).run(timestamp, timestamp, orderId, kitchenId);
      db.prepare(
        `
          UPDATE order_items
          SET status = 'ready', updated_at = ?
          WHERE order_id = ? AND kitchen_id = ? AND status != 'ready'
        `,
      ).run(timestamp, orderId, kitchenId);

      touchTicketAndOrder(orderId, kitchenId);
      return this.getOrderAggregate(orderId)!;
    },
    recordInboundEvent(event) {
      const rowId = crypto.randomUUID();

      insertProviderEvent.run({
        id: rowId,
        provider: event.provider,
        deliveryKey: event.deliveryKey,
        eventType: event.eventType,
        externalOrderId: event.externalOrderId ?? null,
        payloadJson: serializeJson(event.payload),
        receivedAt: event.receivedAt,
      });

      return mapProviderEventRow(
        selectProviderEventById.get(rowId) as ProviderEventRow,
      );
    },
    getInboundEventByDeliveryKey(input) {
      const row = selectProviderEventByDeliveryKey.get({
        provider: input.provider,
        deliveryKey: input.deliveryKey,
      }) as ProviderEventRow | undefined;

      return row ? mapProviderEventRow(row) : undefined;
    },
    startSyncRun(input) {
      const rowId = crypto.randomUUID();
      const startedAt = input.startedAt ?? new Date().toISOString();

      insertSyncRun.run({
        id: rowId,
        provider: input.provider,
        trigger: input.trigger,
        startedAt,
        candidateCount: input.candidateCount ?? 0,
      });

      if (input.sourceEventId) {
        assignSyncRunToEvent.run({
          eventId: input.sourceEventId,
          syncRunId: rowId,
        });
      }

      return mapSyncRunRow(selectSyncRunById.get(rowId) as SyncRunRow);
    },
    finishSyncRun(input) {
      const finishedAt = input.finishedAt ?? new Date().toISOString();

      finishSyncRunStatement.run({
        syncRunId: input.syncRunId,
        status: input.status,
        finishedAt,
        candidateCount: input.candidateCount ?? null,
        importedCount: input.importedCount ?? null,
        ignoredCount: input.ignoredCount ?? null,
        exceptionCount: input.exceptionCount ?? null,
        errorCount: input.errorCount ?? null,
      });

      if (input.event) {
        finishSyncEventStatement.run({
          eventId: input.event.eventId,
          processStatus: input.event.processStatus,
          processedAt: input.event.processedAt ?? finishedAt,
          syncRunId: input.syncRunId,
          errorCode: input.event.errorCode ?? null,
          errorMessage: input.event.errorMessage ?? null,
        });
      }
    },
    getProviderOrder(input) {
      const row = selectProviderOrderByReference.get({
        provider: input.provider,
        externalOrderId: input.externalOrderId,
      }) as ProviderOrderRow | undefined;

      return row ? mapProviderOrderRow(row) : undefined;
    },
    listProviderOrders() {
      return (selectAllProviderOrders.all() as ProviderOrderRow[]).map(
        mapProviderOrderRow,
      );
    },
    upsertProviderOrder(state) {
      upsertProviderOrderStatement.run({
        provider: state.provider,
        externalOrderId: state.externalOrderId,
        providerStatus: state.providerStatus,
        lifecycle: state.lifecycle,
        snapshotHash: state.snapshotHash,
        normalizedJson: serializeJson(state.snapshot),
        lastSeenAt: state.lastSeenAt,
        lastAppliedAt: state.lastAppliedAt,
        importedOrderId: state.importedOrderId,
      });
    },
    openOrRefreshException(input) {
      const existingRow = selectMatchingUnresolvedException.get({
        provider: input.provider,
        kind: input.kind,
        externalOrderId: input.externalOrderId ?? null,
        orderId: input.orderId ?? null,
      }) as SyncExceptionRow | undefined;
      const detectedAt = input.detectedAt ?? new Date().toISOString();
      const lastSeenAt = input.lastSeenAt ?? detectedAt;

      if (existingRow) {
        refreshSyncException.run({
          id: existingRow.id,
          sourceEventId: input.sourceEventId ?? null,
          summary: input.summary,
          detailsJson: serializeJson(input.details),
          lastSeenAt,
        });

        return mapSyncExceptionRow(
          selectSyncExceptionById.get(existingRow.id) as SyncExceptionRow,
        );
      }

      const rowId = crypto.randomUUID();
      insertSyncException.run({
        id: rowId,
        provider: input.provider,
        externalOrderId: input.externalOrderId ?? null,
        orderId: input.orderId ?? null,
        sourceEventId: input.sourceEventId ?? null,
        kind: input.kind,
        summary: input.summary,
        detailsJson: serializeJson(input.details),
        detectedAt,
        lastSeenAt,
      });

      return mapSyncExceptionRow(
        selectSyncExceptionById.get(rowId) as SyncExceptionRow,
      );
    },
    acknowledgeException(input) {
      const existing = selectSyncExceptionById.get(
        input.exceptionId,
      ) as SyncExceptionRow | undefined;

      if (!existing || existing.orderId !== input.orderId || existing.status === "resolved") {
        throw new Error(
          `Sync exception "${input.exceptionId}" is not linked to order "${input.orderId}" or is already resolved`,
        );
      }

      if (existing.status === "acknowledged") {
        return;
      }

      acknowledgeSyncExceptionStatement.run({
        exceptionId: input.exceptionId,
        orderId: input.orderId,
        acknowledgedAt: input.acknowledgedAt ?? new Date().toISOString(),
        acknowledgedVia: input.acknowledgedVia,
        resolutionNote: input.resolutionNote ?? null,
      });
    },
    resolveException(input) {
      resolveSyncExceptionStatement.run({
        provider: input.provider,
        kind: input.kind,
        externalOrderId: input.externalOrderId ?? null,
        orderId: input.orderId ?? null,
        resolvedAt: input.resolvedAt ?? new Date().toISOString(),
        resolvedVia: input.resolvedVia,
        resolutionNote: input.resolutionNote ?? null,
      });
    },
    listUnresolvedSyncExceptions() {
      return (selectUnresolvedExceptions.all() as SyncExceptionRow[]).map(
        mapSyncExceptionRow,
      );
    },
    listUnresolvedSyncExceptionsByOrderIds(orderIds) {
      if (orderIds.length === 0) {
        return [];
      }

      const placeholders = orderIds.map(() => "?").join(", ");
      const rows = db
        .prepare(
          `
            SELECT
              id,
              provider,
              external_order_id as externalOrderId,
              order_id as orderId,
              source_event_id as sourceEventId,
              kind,
              status,
              summary,
              details_json as detailsJson,
              detected_at as detectedAt,
              last_seen_at as lastSeenAt,
              acknowledged_at as acknowledgedAt,
              acknowledged_via as acknowledgedVia,
              resolved_at as resolvedAt,
              resolved_via as resolvedVia,
              resolution_note as resolutionNote
            FROM order_sync_exceptions
            WHERE order_id IN (${placeholders})
              AND status != 'resolved'
            ORDER BY last_seen_at DESC, detected_at DESC
          `,
        )
        .all(...orderIds) as SyncExceptionRow[];

      return rows.map(mapSyncExceptionRow);
    },
    getUnresolvedSyncExceptionForOrder(orderId) {
      const row = selectUnresolvedExceptionForOrder.get(
        orderId,
      ) as SyncExceptionRow | undefined;

      return row ? mapSyncExceptionRow(row) : undefined;
    },
    listSyncExceptionsForOrder(orderId) {
      return (selectSyncExceptionsForOrder.all(orderId) as SyncExceptionRow[]).map(
        mapSyncExceptionRow,
      );
    },
    runInTransaction<T>(work: () => T): T {
      return runAtomicWork(work) as T;
    },
  };
}

function seedDemoOperationalScenarios(repository: ProductionRepository) {
  repository.startKitchenTicket("order_anota-102", "kitchen-1");
  repository.completeKitchenTicket("order_anota-102", "kitchen-1");
  repository.startKitchenTicket("order_anota-102", "kitchen-2");

  repository.startKitchenTicket("order_anota-103", "kitchen-1");
  repository.completeKitchenTicket("order_anota-103", "kitchen-1");
  repository.startKitchenTicket("order_anota-103", "kitchen-2");
  repository.completeKitchenTicket("order_anota-103", "kitchen-2");

  repository.startKitchenTicket("order_anota-104", "kitchen-1");
}

function seedDemoSyncExceptions(repository: SqliteProductionRepository) {
  const changedDetectedAt = new Date(Date.now() - 5 * 60_000).toISOString();
  const changedSeenAt = new Date(Date.now() - 2 * 60_000).toISOString();
  const failedDetectedAt = new Date(Date.now() - 4 * 60_000).toISOString();
  const failedSeenAt = new Date(Date.now() - 90_000).toISOString();

  repository.openOrRefreshException({
    provider: "anota_ai",
    kind: "changed_externally",
    externalOrderId: "anota-101",
    orderId: "order_anota-101",
    summary: "Pedido Pedido 101 divergiu externamente após a importação",
    details: {
      diffs: [
        {
          type: "quantity_changed",
          externalItemId: "101-1",
        },
        {
          type: "order_notes_changed",
        },
      ],
    },
    detectedAt: changedDetectedAt,
    lastSeenAt: changedSeenAt,
  });

  repository.openOrRefreshException({
    provider: "anota_ai",
    kind: "ingestion_failed",
    externalOrderId: "anota-999",
    orderId: null,
    summary: "Falha técnica na sincronização do pedido externo",
    details: {
      errorCode: "provider_fetch_failed",
      errorMessage: "Pedido externo não pôde ser hidratado pelo provedor.",
      stage: "fetch",
    },
    detectedAt: failedDetectedAt,
    lastSeenAt: failedSeenAt,
  });
}

function initializeRepository({
  applyDemoScenarios,
  db,
  importProviderOrders,
  initialKitchenMappings,
  provider,
  seedDemoExceptions,
}: {
  applyDemoScenarios: boolean;
  db: SqliteDatabase;
  importProviderOrders: boolean;
  initialKitchenMappings: readonly MenuItemKitchenMapping[];
  provider: OrderProviderPort;
  seedDemoExceptions: boolean;
}) {
  migrate(db);
  seedStaticData(db, initialKitchenMappings);

  const nextRepository = createProductionRepository(db);

  if (importProviderOrders) {
    const syncResult = syncOrders(nextRepository, provider);

    if (syncResult.skipped.length > 0) {
      for (const skippedOrder of syncResult.skipped) {
        console.warn(
          `[order-sync] skipped ${skippedOrder.externalId} (${skippedOrder.reference}) due to missing mapping for ${skippedOrder.providerExternalId}`,
        );
      }
    }
  }

  if (applyDemoScenarios) {
    seedDemoOperationalScenarios(nextRepository);
  }

  if (seedDemoExceptions && importProviderOrders) {
    seedDemoSyncExceptions(nextRepository);
  }

  return nextRepository;
}

export interface ProductionTestContext {
  database: SqliteDatabase;
  close(): void;
  repository: SqliteProductionRepository;
}

export function createProductionTestContext({
  applyDemoScenarios = false,
  importProviderOrders = false,
  initialKitchenMappings = listMockKitchenMappings(),
  provider = createMockOrderProvider(),
  seedDemoExceptions = false,
}: {
  applyDemoScenarios?: boolean;
  importProviderOrders?: boolean;
  initialKitchenMappings?: readonly MenuItemKitchenMapping[];
  provider?: OrderProviderPort;
  seedDemoExceptions?: boolean;
} = {}): ProductionTestContext {
  const db = createDatabase(":memory:");
  const nextRepository = initializeRepository({
    applyDemoScenarios,
    db,
    importProviderOrders,
    initialKitchenMappings,
    provider,
    seedDemoExceptions,
  });

  return {
    database: db,
    close() {
      db.close();
    },
    repository: nextRepository,
  };
}

function getRuntimeRepositoryConfig(env: NodeJS.ProcessEnv = process.env) {
  const mode = parseOrderSyncProviderMode(env.BISTRO_ORDER_SYNC_PROVIDER_MODE) ?? "mock";

  if (mode === "anota_ai") {
    return {
      applyDemoScenarios: false,
      importProviderOrders: false,
      initialKitchenMappings: [],
      provider: createMockOrderProvider(),
      seedDemoExceptions: false,
    } as const;
  }

  return {
    applyDemoScenarios: true,
    importProviderOrders: true,
    initialKitchenMappings: listMockKitchenMappings(),
    provider: createMockOrderProvider(),
    seedDemoExceptions: true,
  } as const;
}

export function getProductionRepository() {
  if (!repository) {
    database = createDatabase(getConfiguredDatabasePath());
    repository = initializeRepository({
      db: database,
      ...getRuntimeRepositoryConfig(),
    });
  }

  return repository;
}

export function resetProductionRepositoryForTests() {
  if (database) {
    database.close();
  }

  database = undefined;
  repository = undefined;
}
