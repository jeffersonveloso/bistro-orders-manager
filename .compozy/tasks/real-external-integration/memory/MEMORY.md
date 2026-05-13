# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State
- Task 02 added durable SQLite sync persistence and repository coverage for provider events, sync runs, provider order state, and sync exceptions.
- Task 05 exposed authenticated webhook, reconciliation, and exception-acknowledge routes on the App Router, with route tests covering auth, duplicate delivery, replayable failures, and idempotent acknowledgment.
- Task 09 completed the final local QA pass, refreshed `qa/verification-report.md`, and fixed the live bootstrap so fresh `anota_ai` databases no longer seed demo orders or demo sync exceptions.

## Shared Decisions
- Operationally visible sync exceptions are treated as all unresolved records (`open` and `acknowledged`); only `resolved` removes them from board/detail/salão decoration queries.
- Provider selection is centralized in `src/infrastructure/order-provider-factory.ts` with modes `mock` and `anota_ai`, driven by `BISTRO_ORDER_SYNC_PROVIDER_MODE`, `BISTRO_ANOTA_AI_TOKEN`, and optional `BISTRO_ANOTA_AI_BASE_URL`.
- Phase 1 provider normalization accepts only catalog external IDs (`externalId` / `external_id`) as the bridge into internal `menuItemId`; missing identifiers must fail sync normalization instead of falling back to item names.
- Live provider orchestration now lives in `src/application/provider-sync-service.ts`; `src/application/order-sync-service.ts` remains only as the legacy/demo importer used by startup seed flows.
- Shared-secret route auth is centralized in `app/api/_lib/provider-sync-route.ts` using `BISTRO_ANOTA_WEBHOOK_SECRET` + `x-bistro-anota-webhook-secret` for webhook traffic and `BISTRO_INTERNAL_SYNC_SECRET` + `x-bistro-internal-sync-secret` for reconciliation traffic.
- Runtime repository bootstrap depends on provider mode: `mock` still seeds demo orders/scenarios/exceptions, while `anota_ai` seeds only kitchens plus menu mappings on a fresh SQLite file.

## Shared Learnings
- `recordInboundEvent` intentionally relies on the SQLite `(provider, delivery_key)` uniqueness constraint and will throw on duplicate deliveries; later sync orchestration should catch that and convert it into duplicate/idempotent behavior.
- `upsertProviderOrder` is the safe refresh path for canonical provider state; repository callers should not expect duplicate `(provider, external_order_id)` refreshes to fail.
- Downstream sync flows can stay provider-agnostic by using `OrderSyncProviderPort`: the mock sync provider now emits canonical `anota_ai` snapshots locally, and the real Anota adapter lists candidate IDs from `/ping/list` before hydrating full snapshots via `/ping/get/{id}`.
- `OrderSyncProviderPort.listConfirmedOrders()` should be treated as unbounded when `limit` is omitted; the real Anota adapter now paginates across all available `/ping/list` pages instead of truncating to the first page.
- Successful replay/apply must resolve `ingestion_failed` by `external_order_id` even when older failures were linked with different `order_id` values, because the same external order can fail before and after import.
- The webhook route treats `deliveryKey` plus `eventType` as the minimum usable envelope; missing `externalOrderId` is intentionally allowed through so the shared sync service records replayable `ingestion_failed` instead of the route short-circuiting with `400`.
- The `qa-execution` skill was usable as process guidance, but this repository does not contain the referenced discovery helper `scripts/discover-project-contract.py`, so QA command discovery must fall back to `package.json`, config files, and existing `qa/` artifacts.

## Open Risks
- Live credential ownership (`BISTRO_ANOTA_AI_TOKEN`, webhook secret, internal sync secret) and production scheduler cadence remain unverified because task 09 had only a local fake-provider environment, not a real Anota pilot target.

## Handoffs
- Task 04 can build orchestration directly on `runInTransaction`, sync run finishing, provider order upserts, and exception open/acknowledge/resolve methods now present in `src/infrastructure/sqlite.ts`.
- Task 04 and Task 05 should instantiate providers through `createConfiguredOrderSyncProvider()` instead of importing provider implementations directly.
- Task 06 can consume unresolved-exception query helpers from `ProviderSyncRepository` instead of reaching into SQLite directly.
- Task 05 routes should inspect `WebhookProcessResult.status` and `SyncRunResult.status/errorCount` instead of inferring transport status from thrown expected errors; the service now returns structured failed results for canonical fetch/normalization issues.
- Task 05 and any migration-safe live flow should account for legacy imported demo orders that may exist without `provider_orders` rows; the sync service now falls back to `orders.external_id` when binding imported production entities.
- Task 06 salão integration can call the new acknowledge route without provider credentials; the runtime path is intentionally repository-only under the hood.
- Task 09 should execute the canonical Phase 1 QA package from `qa/test-plans/real-integration-test-plan.md`, `qa/test-plans/real-integration-regression.md`, and the paired `qa/test-cases/` artifacts. Task 08 had to use the manual `qa-report` fallback because this environment exposes documentation and interactive scripts, not a non-interactive artifact generator.
