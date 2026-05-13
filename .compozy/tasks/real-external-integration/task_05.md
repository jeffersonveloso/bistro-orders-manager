---
status: completed
title: "Expose authenticated webhook, reconciliation, and acknowledge routes"
type: backend
complexity: high
dependencies:
  - task_02
  - task_03
  - task_04
---

# Task 05: Expose authenticated webhook, reconciliation, and acknowledge routes

## Overview
Publish the Phase 1 sync entry points and the minimal operator acknowledgment path using explicit, authenticated HTTP contracts. This task makes the new sync service reachable from the provider, scheduler, and salão workflow without changing the existing kitchen mutation routes.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST add provider-facing webhook and internal reconciliation routes with shared-secret authentication validated before any side effects occur.
2. MUST keep webhook processing synchronous in Phase 1, returning `200`, `400`, `401`, or `500` according to the approved contract.
3. MUST add an idempotent exception acknowledgment route that returns `200` for both `open -> acknowledged` and already `acknowledged` cases.
4. MUST add route-level tests for auth failures, happy paths, duplicate handling, and canonical-fetch failure behavior.
</requirements>

## Subtasks
- [x] 5.1 Add the Anota webhook route and connect it to provider selection, event journaling, and synchronous sync apply.
- [x] 5.2 Add the internal reconciliation route for scheduled runs and targeted replay requests.
- [x] 5.3 Add the order-linked exception acknowledgment route with idempotent status semantics.
- [x] 5.4 Document or centralize shared-secret environment usage inside the route layer and supporting infrastructure.
- [x] 5.5 Add route tests for auth guards, status codes, and result payloads.

## Implementation Details
Follow the existing App Router route patterns and reuse the sync service instead of embedding business rules into handlers. See TechSpec sections `API Endpoints`, `Component Overview`, `Apply Algorithm`, and `Integration Points`.

### Relevant Files
- `app/api/orders/[orderId]/items/[itemId]/route.ts` — current mutation route style for validation and response handling.
- `app/api/orders/[orderId]/tickets/[kitchenId]/route.ts` — existing authenticated-free mutation pattern to keep consistent route structure.
- `app/api/orders/mutations.test.ts` — current route-test style for handler helpers.
- `src/infrastructure/sqlite.ts` — source of repository and production context access.

### Dependent Files
- `app/api/integrations/anota-ai/webhook/route.ts` — new file created by this task.
- `app/api/internal/sync/anota-ai/route.ts` — new file created by this task.
- `app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts` — new file created by this task.
- `src/components/kds/salon-client.tsx` — later calls the acknowledge route in task 06.

### Related ADRs
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Defines the required routes.
- [ADR-007: Shared Secret Authentication for Sync Entry Points](adrs/adr-007.md) — Constrains auth and response semantics.

## Deliverables
- New webhook, reconciliation, and exception acknowledgment routes aligned with the approved HTTP contract.
- Shared-secret validation for webhook and reconciliation entry points.
- Route tests covering auth failures, duplicate requests, successful imports, and idempotent acknowledgment.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for route-to-service-to-repository flows **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Missing or invalid webhook secret returns `401` before any sync side effects are persisted.
  - [x] Invalid webhook envelope returns `400` without opening production exceptions.
  - [x] Acknowledge route returns `200` when an open exception is acknowledged.
  - [x] Acknowledge route returns `200` when the same exception is already acknowledged.
- Integration tests:
  - [x] Successful webhook processing returns `200` with a terminal business outcome payload.
  - [x] Canonical fetch or apply failure returns `500` and leaves the event eligible for replay or reconciliation.
  - [x] Reconciliation route processes a targeted `externalOrderId` request and returns a sync summary.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Sync entry points are reachable through authenticated routes with the approved status semantics.
- No provider or scheduler request can mutate state without passing the route-level secret checks.
