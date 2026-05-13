# Real External Integration TechSpec

## Executive Summary

Phase 1 should implement real external intake as a `webhook-first + scheduled reconciliation` pipeline that writes into SQLite, then projects the result into the existing production read models. The core change is not the kitchen domain itself; it is a new sync layer that receives provider signals, fetches a canonical order snapshot from Anota AI, applies idempotent import or divergence rules, and exposes open exceptions to the board, order detail, and salão surfaces.

The main trade-off is deliberate: we add a small amount of schema and route complexity to keep the kitchen board predictable. Production tables remain the source of truth for kitchen execution, while sync tables explain what the provider sent, what the app applied, and why an order is blocked or marked as changed externally.

## System Architecture

### Component Overview

Main components, their responsibilities, and relationships:

- `app/api/integrations/anota-ai/webhook/route.ts`
  - Authenticates provider traffic, persists inbound events, and invokes the shared sync service.
- `app/api/internal/sync/anota-ai/route.ts`
  - Authenticates scheduler or manual reconciliation calls and runs the same sync pipeline over recent confirmed orders or a targeted `externalOrderId`.
- `app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts`
  - Minimal exception acknowledgment endpoint for atendimento or salão ownership in Phase 1.
- `src/application/provider-sync-service.ts`
  - Orchestrates canonical fetch, idempotency, import, divergence detection, exception lifecycle, and sync-run accounting.
- `src/application/ports.ts`
  - Gains `OrderSyncProviderPort` and `ProviderSyncRepository` contracts without pushing provider details into the kitchen domain.
- `src/domain/provider-sync.ts`
  - Holds sync enums and types such as `SyncTrigger`, `SyncExceptionKind`, `SyncExceptionStatus`, `ProviderOrderLifecycle`, and `ProviderOrderSnapshot`.
- `src/infrastructure/anota-ai-provider.ts`
  - Maps provider-specific API payloads into normalized snapshot types and production-ready order input.
- `src/infrastructure/order-provider-factory.ts`
  - Selects `mock` or `anota_ai` provider mode by env so local demo and test flows remain intact.
- `src/infrastructure/sqlite.ts`
  - Adds additive migrations and repository methods for sync runs, events, provider order state, and order-level exceptions.
- `src/application/production-service.ts`
  - Extends existing board and order detail read models with open sync exception markers and a minimal sync trail.

Data flow between components:

1. Webhook arrives, passes auth, persists `provider_event`, starts a `sync_run`, fetches a canonical order snapshot, and applies the shared sync pipeline synchronously.
2. Reconciliation route runs on an external schedule, lists recent confirmed orders or replays a targeted external order, and reuses the same apply pipeline.
3. UI keeps polling existing board and detail APIs; those APIs now include exception metadata without changing kitchen status semantics.

External system interactions:

- Anota AI provides event signals and canonical order snapshots.
- An external scheduler invokes authenticated reconciliation.

## Implementation Design

### Core Interfaces

```ts
export interface ProviderSyncService {
  handleWebhook(input: WebhookInput): Promise<WebhookProcessResult>;
  reconcileConfirmedOrders(input: ReconcileInput): Promise<SyncRunResult>;
  acknowledgeException(input: AcknowledgeExceptionInput): Promise<void>;
}
```

```ts
export interface OrderSyncProviderPort {
  providerName(): "anota_ai";
  fetchOrderById(externalOrderId: string): Promise<ProviderOrderSnapshot | null>;
  listConfirmedOrders(input: {
    updatedSince?: string;
    limit?: number;
  }): Promise<ProviderOrderSnapshot[]>;
  toProductionInput(snapshot: ProviderOrderSnapshot): RawProviderOrderInput | null;
}
```

```ts
export interface ProviderSyncRepository {
  recordInboundEvent(event: InboundProviderEvent): ProviderEventRecord;
  startSyncRun(input: StartSyncRunInput): SyncRunRecord;
  finishSyncRun(input: FinishSyncRunInput): void;
  getProviderOrder(input: {
    provider: string;
    externalOrderId: string;
  }): ProviderOrderState | undefined;
  upsertProviderOrder(state: ProviderOrderState): void;
  openOrRefreshException(input: OpenSyncExceptionInput): SyncExceptionRecord;
  acknowledgeException(input: AcknowledgeSyncExceptionInput): void;
  resolveException(input: ResolveSyncExceptionInput): void;
  runInTransaction<T>(work: () => T): T;
}
```

### Data Models

Core domain entities and their relationships:

- Existing production entities remain unchanged:
  - `orders`
  - `kitchen_tickets`
  - `order_items`
  - `menu_item_kitchen_mappings`
  - `kitchens`
- New sync entities:
  - `ProviderOrderSnapshot`
  - `ProviderOrderState`
  - `ProviderEventRecord`
  - `SyncRunRecord`
  - `SyncExceptionRecord`

`ProviderOrderSnapshot` fields:

- `provider`
- `externalOrderId`
- `reference`
- `customerName`
- `channel`
- `providerStatus`
- `lifecycle`
- `providerUpdatedAt`
- `items`
- `notes`
- `rawPayload`

`SyncExceptionKind` values:

- `missing_mapping`
- `changed_externally`
- `canceled_externally`
- `ingestion_failed`

`SyncExceptionStatus` values:

- `open`
- `acknowledged`
- `resolved`

Database schemas or storage structures:

- `provider_events`
  - `id`
  - `provider`
  - `delivery_key`
  - `event_type`
  - `external_order_id NULL`
  - `payload_json`
  - `received_at`
  - `processed_at NULL`
  - `process_status` = `received | processed | failed`
  - `sync_run_id NULL`
  - `error_code NULL`
  - `error_message NULL`
  - `UNIQUE(provider, delivery_key)`

- `sync_runs`
  - `id`
  - `provider`
  - `trigger` = `webhook | reconciliation | replay`
  - `status` = `running | completed | failed`
  - `started_at`
  - `finished_at NULL`
  - `candidate_count`
  - `imported_count`
  - `ignored_count`
  - `exception_count`
  - `error_count`

- `provider_orders`
  - `provider`
  - `external_order_id`
  - `provider_status`
  - `lifecycle`
  - `snapshot_hash`
  - `normalized_json`
  - `last_seen_at`
  - `last_applied_at NULL`
  - `imported_order_id NULL`
  - `UNIQUE(provider, external_order_id)`

- `order_sync_exceptions`
  - `id`
  - `provider`
  - `external_order_id NULL`
  - `order_id NULL`
  - `source_event_id NULL`
  - `kind` = `missing_mapping | changed_externally | canceled_externally | ingestion_failed`
  - `status` = `open | acknowledged | resolved`
  - `summary`
  - `details_json`
  - `detected_at`
  - `last_seen_at`
  - `acknowledged_at NULL`
  - `acknowledged_via NULL`
  - `resolved_at NULL`
  - `resolved_via NULL`
  - `resolution_note NULL`

Request and response type extensions for APIs:

- `BoardTicketCard`
  - `hasOpenSyncException`
  - `syncExceptionLabel`
- `DashboardData`
  - `openSyncExceptions`
  - `syncAlerts[]`
- `OrderDetailData`
  - `syncException`
  - `syncTrail[]`
- `salonSummary`
  - `hasOpenSyncException`
  - `syncExceptionLabel`

Normalization rule:

- The adapter must derive the provider routing key from Anota catalog `externalID`.
- No name-based fallback is allowed in Phase 1.
- If any item has no usable local mapping, the entire order stays out of production and opens a `missing_mapping` exception.

### API Endpoints

API surface organized by resource:

- `POST /api/integrations/anota-ai/webhook`
  - Description: provider-facing intake
  - Auth: shared secret header from env
  - Request format: provider webhook payload; exact field names depend on confirmed Anota contract
  - Processing contract:
    - validate secret
    - validate minimum envelope
    - persist or upsert inbound event row
    - fetch canonical provider snapshot immediately
    - run apply logic immediately
    - mark event `processed` or `failed`
  - Response format and status codes:
    - `200` for terminal business outcomes:
      - `imported`
      - `duplicate_ignored`
      - `exception_opened`
      - `exception_refreshed`
    - `400` invalid payload before a usable event envelope exists
    - `401` invalid secret
    - `500` journaling succeeded but canonical fetch or apply failed; event remains `failed` and eligible for retry or reconciliation

- `POST /api/internal/sync/anota-ai`
  - Description: scheduled reconciliation or targeted replay
  - Auth: shared secret header from env
  - Request format:
    - optional `externalOrderId`
    - optional `limit`
  - Response format and status codes:
    - `200` with `{ runId, processed, imported, ignored, openedExceptions, resolvedExceptions }`
    - `401` invalid secret

- `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`
  - Description: mark an exception as seen by atendimento or salão
  - Request format:
    - optional `resolutionNote`
  - Response format and status codes:
    - `200` if `open -> acknowledged`
    - `200` if already `acknowledged`
    - `404` only if the exception does not exist, is not linked to the order, or is already `resolved`

- `GET /api/board`
  - Description: existing production board payload extended with sync alerts and per-ticket exception markers

- `GET /api/orders/[orderId]`
  - Description: existing order detail payload extended with open exception summary and minimal sync trail

### Apply Algorithm

1. Persist inbound event and start sync run.
2. Fetch canonical snapshot using `external_order_id`.
3. If canonical fetch fails:
  - mark the event as `failed`
  - open or refresh an `ingestion_failed` exception
  - attach `external_order_id` when available
  - always attach `source_event_id`
  - leave `order_id` null if no internal order exists
  - finish sync run as `failed`
  - return `500`
4. If snapshot normalization fails:
  - follow the same `ingestion_failed` path
5. Load existing provider state and check whether an internal order already exists for `(provider, external_order_id)`.
6. If no internal order exists:
  - if lifecycle is not `confirmed_ready`:
    - update `provider_orders`
    - do not import
    - do not open a production exception
    - resolve prior `ingestion_failed` if this run succeeded technically
    - finish successfully
  - if lifecycle is `confirmed_ready`:
    - normalize to `RawProviderOrderInput`
    - call `splitProviderOrder`
    - on success, import production entities, update `provider_orders`, and resolve prior blocking exceptions for that external order
    - on `MissingKitchenMappingError`, open or refresh `missing_mapping`, keep order out of production, and return `200` with `exception_opened`
7. If an internal order already exists:
  - update `provider_orders`
  - if lifecycle is no longer `confirmed_ready`:
    - open or refresh `canceled_externally`
    - never mutate `orders`, `order_items`, or kitchen statuses
    - resolve prior `ingestion_failed` if this run succeeded technically
    - finish successfully
  - if lifecycle is still `confirmed_ready`:
    - compare `snapshot_hash`
    - if unchanged:
      - mark event as processed duplicate
      - resolve prior `ingestion_failed` if this run succeeded technically
    - if changed:
      - classify diff
      - for item add or remove, quantity change, or production-affecting modifier or note change:
        - open or refresh `changed_externally`
        - never mutate `orders`, `order_items`, or kitchen statuses
      - for irrelevant diffs:
        - update `provider_orders` only
8. Successful replay or reconciliation resolves:
  - `ingestion_failed` when canonical fetch, normalize, and apply succeeds
  - `missing_mapping` when import succeeds after mapping is fixed
  - `canceled_externally` when a later canonical snapshot returns to a production-valid confirmed state according to current Phase 1 rules
  - `changed_externally` when a later canonical snapshot no longer contains the divergence condition

## Integration Points

External services and system boundaries:

- Anota AI order API
  - Purpose: canonical order fetch and confirmed-order reconciliation
  - Authentication approach: provider-specific credentials managed in env
  - Error handling and retry strategy:
    - webhook path records `ingestion_failed` on canonical fetch or normalization failure
    - reconciliation path retries by schedule and supports targeted replay
- External scheduler
  - Purpose: invoke `POST /api/internal/sync/anota-ai`
  - Authentication and authorization approach: reconciliation shared secret header
  - Error handling and retry strategy: scheduler retries failed reconciliation calls and alerts on stale sync windows
- Provider catalog external IDs
  - Purpose: canonical menu mapping key between provider items and local `menu_item_id`

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|-----------|-------------|---------------------|-----------------|
| `src/application/ports.ts` | modified | Adds sync-specific ports; medium risk due to shared repository boundary | Introduce `OrderSyncProviderPort` and `ProviderSyncRepository` |
| `src/application/order-sync-service.ts` | modified/deprecated | Current sync flow is too narrow and synchronous-only | Replace or supersede with `provider-sync-service.ts` |
| `src/domain/split-order-service.ts` | modified | Reused for import path; low risk | Keep fail-closed mapping behavior and surface structured exceptions |
| `src/infrastructure/sqlite.ts` | modified | Largest schema and repository change; medium risk | Add migrations, transactions, sync repositories, and read-model joins |
| `src/infrastructure/mock-order-provider.ts` | modified | Must support new provider port in test/demo mode; low risk | Extend fixture provider for sync tests |
| `app/api/board/route.ts` | modified | Response shape changes; low risk | Return sync alerts and exception markers |
| `app/api/orders/[orderId]/route.ts` | modified | Response shape changes; low risk | Return sync trail and current exception |
| `src/components/kds/dashboard-client.tsx` | modified | New exception chips and alerts; low UI risk | Render board-level alert strip and per-card marker |
| `src/components/kds/order-detail-client.tsx` | modified | New sync-trail surface; low UI risk | Render exception banner and trail |
| `src/components/kds/salon-client.tsx` | modified | First minimal operational action outside kitchen; medium product risk | Show exception banner and acknowledgment action |

## Testing Approach

### Unit Tests

- Provider adapter normalization:
  - status-to-lifecycle mapping
  - catalog `externalID` extraction
  - snapshot hashing
- Sync classification:
  - duplicate event detection
  - relevant vs irrelevant external changes
  - imported-order cancellation path
  - missing-mapping exception opening
- Exception lifecycle:
  - `open -> acknowledged`
  - acknowledged endpoint idempotency
  - replay resolves `missing_mapping`
  - replay or reconciliation resolves `changed_externally` and `canceled_externally`

### Integration Tests

- SQLite migration and repository behavior:
  - unique `(provider, delivery_key)`
  - unique `(provider, external_order_id)`
  - transactional apply across production tables and sync tables
  - open exception query joins for board and detail
- Route integration:
  - webhook auth failures
  - webhook accepted plus canonical fetch plus successful import
  - webhook duplicate ignored
  - targeted replay after mapping fix
  - changed external order opens exception without mutating production items
  - imported order cancellation opens `canceled_externally` without mutating production items

Focused E2E:

- Start app in fixture-provider mode
- Trigger targeted sync for a known order through the internal sync route
- Assert board and salão show the exception marker
- Open order detail and verify sync trail
- Acknowledge the exception from the salão surface and verify status becomes acknowledged but remains visible until reconciliation clears it

## Development Sequencing

### Build Order

1. Add sync domain types and extend provider or repository ports - no dependencies
2. Add additive SQLite migrations and repository methods for runs, events, provider order state, and exceptions - depends on step 1
3. Implement provider factory and extend mock provider to the new sync port - depends on step 1
4. Implement `anota-ai-provider.ts` with canonical fetch and normalization - depends on step 3
5. Implement `provider-sync-service.ts` with transactional apply, dedupe, replay, and exception classification - depends on steps 2, 3, and 4
6. Add webhook and reconciliation routes - depends on step 5
7. Extend board and detail read models and add the exception acknowledge route - depends on steps 2 and 5
8. Update dashboard, order detail, and salão UI for markers, alert strip, sync trail, and acknowledgment action - depends on step 7
9. Add tests across unit, repository integration, route integration, and one E2E exception flow - depends on steps 5, 6, 7, and 8

### Technical Dependencies

- Confirmed Anota sandbox or staging credentials
- Confirmed webhook configuration capability and exact request field names
- External scheduler capable of authenticated 2-minute POSTs
- Provider catalog populated with `externalID` values that are bound to local menu mappings

## Monitoring and Observability

Operational visibility for the implementation:

- Key metrics to track:
  - `provider_webhook_received_total`
  - `provider_webhook_ignored_total`
  - `provider_sync_run_duration_ms`
  - `provider_sync_imported_orders_total`
  - `provider_sync_open_exceptions_total{kind}`
  - `provider_sync_auth_failures_total`
  - `provider_sync_stale_reconciliation_seconds`
- Log events and structured fields:
  - `provider`
  - `trigger`
  - `runId`
  - `eventId`
  - `externalOrderId`
  - `orderId`
  - `deliveryKey`
  - `snapshotHash`
  - `result`
  - `exceptionKind`
- Alerting thresholds and escalation:
  - no successful reconciliation in 10 minutes
  - any open `missing_mapping` exception older than 5 minutes during active service
  - 3 or more `ingestion_failed` events in 10 minutes
  - sustained webhook auth failures above normal baseline

## Technical Considerations

### Key Decisions

- Decision: keep provider lifecycle mapping inside the adapter
  - Rationale: kitchen statuses remain provider-agnostic
  - Trade-offs: adapter becomes the main translation boundary
  - Alternatives rejected: leaking provider statuses into production read models
- Decision: store sync metadata separately from production aggregates
  - Rationale: board remains stable after import
  - Trade-offs: larger schema and repository scope
  - Alternatives rejected: mutating production tables for every provider-side change
- Decision: do not import provider orders during app startup in live mode
  - Rationale: sync must happen only through webhook or reconciliation routes
  - Trade-offs: startup no longer seeds live provider state
  - Alternatives rejected: side-effectful startup sync in the production server process
- Decision: add one minimal exception acknowledgment action in the salão surface
  - Rationale: meets the PRD ownership requirement without building a broader exception console
  - Trade-offs: introduces a small non-kitchen write path
  - Alternatives rejected: kitchen-owned reconciliation or a full exception management UI in Phase 1

### Known Risks

- Risk description and likelihood:
  - The Anota docs available here are JS-rendered, so exact payload fields and auth header names are not fully verifiable in this environment.
  - Likelihood: medium
  - Mitigation approach: confirm the contract with sandbox credentials before coding the adapter.
- Risk description and likelihood:
  - Inline canonical fetch in the webhook route may increase response time.
  - Likelihood: medium
  - Mitigation approach: keep the handler thin, persist first, and rely on scheduled reconciliation as the recovery path.
- Risk description and likelihood:
  - The new salão acknowledgment action is the first non-kitchen write control in the UI.
  - Likelihood: low
  - Mitigation approach: keep the action scoped to exception acknowledgment only.

## Architecture Decision Records

ADRs documenting key decisions made during PRD brainstorming and technical design:

- [ADR-001: Controlled Confirmed-Order Ingestion for Real External Integration](adrs/adr-001.md) — Locks Phase 1 to confirmed-order intake, duplicate protection, and failure visibility.
- [ADR-002: Signal External Order Changes Without Rewriting the Kitchen Board](adrs/adr-002.md) — Keeps imported production orders stable after provider-side changes.
- [ADR-003: Alert Only on Operationally Relevant External Changes and Route Resolution to Atendimento](adrs/adr-003.md) — Narrows alerts to meaningful deltas and assigns operational ownership outside the kitchen.
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Uses webhook for latency and scheduled sync for recovery.
- [ADR-005: Canonical Snapshot Sync With Dedicated SQLite Sync Tables](adrs/adr-005.md) — Separates sync state from production state and persists an audit trail.
- [ADR-006: Fail Closed on Unmapped Provider Items](adrs/adr-006.md) — Keeps orders with missing mappings out of the kitchen board.
- [ADR-007: Shared Secret Authentication for Sync Entry Points](adrs/adr-007.md) — Protects webhook and reconciliation routes with env-backed shared secrets.
- [ADR-008: Use Provider Catalog External IDs as the Canonical Menu Mapping Key](adrs/adr-008.md) — Avoids fuzzy name matching and anchors routing to provider catalog IDs.
