---
status: completed
title: "Build sync orchestration, idempotency, and exception lifecycle"
type: backend
complexity: high
dependencies:
  - task_01
  - task_02
  - task_03
---

# Task 04: Build sync orchestration, idempotency, and exception lifecycle

## Overview
Implement the core application service that turns provider events and reconciliation runs into predictable production outcomes. This task owns canonical fetch handling, duplicate suppression, import decisions, fail-closed mapping behavior, and the lifecycle of `ingestion_failed`, `missing_mapping`, `changed_externally`, and `canceled_externally`.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST implement the approved apply algorithm, including separate paths for not-yet-imported orders and already-imported orders.
2. MUST treat canonical fetch or normalization failures as `ingestion_failed` exceptions linked to `source_event_id` and `external_order_id` when available.
3. MUST keep imported production entities stable after import and MUST open or refresh divergence exceptions instead of mutating kitchen order state.
4. MUST resolve or refresh exceptions only according to the approved lifecycle semantics for `open`, `acknowledged`, and `resolved`.
</requirements>

## Subtasks
- [x] 4.1 Create the sync orchestration service and request or result types for webhook, reconciliation, and replay flows.
- [x] 4.2 Implement provider event deduplication, sync-run accounting, and canonical fetch error handling.
- [x] 4.3 Implement import, replay, and fail-closed `missing_mapping` behavior using the existing split service.
- [x] 4.4 Implement relevant-change classification for imported orders, including cancellation and production-affecting diffs.
- [x] 4.5 Add service tests for duplicate events, pre-confirmation no-import paths, imported-order cancellation, and exception resolution rules.

## Implementation Details
Keep the orchestration logic inside application services and reuse the existing split-order boundary instead of duplicating import rules. See TechSpec sections `Apply Algorithm`, `Core Interfaces`, `Technical Considerations`, and `Known Risks`.

### Relevant Files
- `src/application/order-sync-service.ts` — current sync orchestration that can be superseded or refactored into the new service.
- `src/domain/split-order-service.ts` — existing import boundary and missing-mapping signal.
- `src/infrastructure/sqlite.ts` — repository implementation that this service will call transactionally.
- `src/application/order-sync-service.test.ts` — existing sync test patterns that can be extended or replaced.

### Dependent Files
- `app/api/integrations/anota-ai/webhook/route.ts` — will call this service in task 05.
- `app/api/internal/sync/anota-ai/route.ts` — will call reconciliation entry points in task 05.
- `src/application/production-service.ts` — later consumes persisted exception state created by this service.
- `src/components/kds/*.tsx` — later renders exception outcomes derived from this service.

### Related ADRs
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Defines the orchestration entry points.
- [ADR-005: Canonical Snapshot Sync With Dedicated SQLite Sync Tables](adrs/adr-005.md) — Requires journaled runs, events, and provider order state.
- [ADR-006: Fail Closed on Unmapped Provider Items](adrs/adr-006.md) — Directly constrains import behavior.
- [ADR-008: Use Provider Catalog External IDs as the Canonical Menu Mapping Key](adrs/adr-008.md) — Constrains normalized import inputs.

## Deliverables
- A new or refactored provider sync orchestration service implementing the approved apply algorithm.
- Exception lifecycle handling for `ingestion_failed`, `missing_mapping`, `changed_externally`, and `canceled_externally`.
- Service-level tests covering happy paths, duplicate suppression, relevant divergence, and replay resolution.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for transaction-backed sync apply behavior **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] A confirmed order with no prior import is imported exactly once even when duplicate events are received.
  - [x] A non-confirmed order with no internal order updates provider state but does not create production entities.
  - [x] A canonical fetch failure opens or refreshes `ingestion_failed` with event linkage.
  - [x] An imported order that later leaves `confirmed_ready` opens or refreshes `canceled_externally` without mutating kitchen entities.
  - [x] A relevant item or quantity change on an imported confirmed order opens or refreshes `changed_externally`.
- Integration tests:
  - [x] A replay after fixing a missing mapping resolves `missing_mapping` and imports the order successfully.
  - [x] Successful replay or reconciliation resolves `ingestion_failed` only after a technically successful sync pass.
  - [x] Existing production import behavior remains intact for unchanged mock scenarios.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Sync orchestration matches the approved lifecycle semantics and apply paths from the TechSpec.
- Imported kitchen entities remain stable while exceptions capture provider-side divergence.
