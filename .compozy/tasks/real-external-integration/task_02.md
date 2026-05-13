---
status: completed
title: "Add SQLite sync schema and repository support"
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 02: Add SQLite sync schema and repository support

## Overview
Extend the SQLite persistence layer with durable sync state, provider order state, and operator-visible exceptions while keeping the current production tables as the kitchen source of truth. This task creates the migrations and repository methods that make webhook intake, replay, reconciliation, and exception rendering queryable and transactional.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST add additive SQLite schema support for `provider_events`, `sync_runs`, `provider_orders`, and `order_sync_exceptions` exactly within the approved Phase 1 scope.
2. MUST enforce provider-scoped uniqueness for inbound events and provider orders using `(provider, delivery_key)` and `(provider, external_order_id)`.
3. MUST implement repository methods for recording inbound events, sync runs, provider order state, exception open or acknowledge or resolve transitions, and transactional sync apply behavior.
4. MUST preserve all current production table semantics and existing demo flows so the MVP board remains intact until later tasks wire real sync paths.
</requirements>

## Subtasks
- [x] 2.1 Add SQLite migration statements and typed row models for sync events, runs, provider order state, and order sync exceptions.
- [x] 2.2 Implement repository read and write methods required by the new sync interfaces, including transactional execution helpers.
- [x] 2.3 Add query helpers that later tasks can use to decorate board, detail, and salão read models with open exception state.
- [x] 2.4 Update in-memory or test repository setup paths so repository tests can exercise the new schema without touching production data files.
- [x] 2.5 Add repository-focused tests for uniqueness, transactional writes, and exception lifecycle persistence.

## Implementation Details
Keep the implementation in `src/infrastructure/sqlite.ts` unless a small local helper module materially improves clarity. See TechSpec sections `Data Models`, `Apply Algorithm`, and `Impact Analysis`.

### Relevant Files
- `src/infrastructure/sqlite.ts` — current schema, seed, repository implementation, and test context helpers.
- `scripts/reset-sqlite-db.mjs` — useful when schema changes require reset guidance or cleanup behavior.
- `src/application/ports.ts` — defines the repository methods this task must implement.
- `src/application/order-sync-service.test.ts` — current sync test style and useful patterns for repository-backed sync validation.

### Dependent Files
- `src/application/provider-sync-service.ts` — will rely on these repository methods in task 04.
- `app/api/board/route.ts` — later consumes read-model additions backed by new queries.
- `app/api/orders/[orderId]/route.ts` — later needs sync trail and exception reads from this storage layer.
- `src/components/kds/*.tsx` — later surfaces exception state produced by these repository queries.

### Related ADRs
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Requires persisted coordination between webhook and reconciliation paths.
- [ADR-005: Canonical Snapshot Sync With Dedicated SQLite Sync Tables](adrs/adr-005.md) — Directly defines this schema expansion.
- [ADR-006: Fail Closed on Unmapped Provider Items](adrs/adr-006.md) — Requires durable exception storage instead of console-only skips.

## Deliverables
- Additive SQLite schema for sync events, sync runs, provider orders, and order sync exceptions.
- Repository methods and typed rows supporting transactional sync apply and exception lifecycle updates.
- Repository or infrastructure tests covering uniqueness, transaction safety, and query access for open exceptions.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for SQLite sync persistence and read queries **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Row-mapping helpers return expected domain or repository records for sync runs and exceptions.
  - [x] Exception status transition helpers persist `open`, `acknowledged`, and `resolved` correctly.
  - [x] Provider-scoped uniqueness checks reject duplicate `(provider, delivery_key)` and `(provider, external_order_id)` values.
- Integration tests:
  - [x] Repository transaction path writes event, run, provider order, and exception records atomically.
  - [x] Open exception queries return the correct order-linked records for board and detail decoration.
  - [x] Existing production repository tests continue to pass with the expanded schema.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- SQLite supports the new sync lifecycle without changing existing production order semantics.
- Repository methods exist for every sync persistence capability required by the approved TechSpec.
