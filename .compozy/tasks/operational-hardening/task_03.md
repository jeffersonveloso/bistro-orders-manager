---
status: completed
title: "Add protected read models and auth-first read APIs for kitchen and salão"
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 03: Add protected read models and auth-first read APIs for kitchen and salão

## Overview
Restructure the protected read surface so kitchens and salão no longer share the same payload contract. This task adds the salão-specific read model and enforces authentication and area policy on `GET /api/board` and `GET /api/orders/[orderId]` before any provider refresh or protected read-model preparation occurs.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST add a dedicated salão read contract and route so salão no longer consumes the full kitchen board payload.
2. MUST protect `GET /api/board` and `GET /api/orders/[orderId]` with auth-first guards that run before `maybeRefreshRuntimeProviderSync()` or any expensive protected read-model work.
3. MUST implement explicit handler behavior for missing `kitchen` on `GET /api/orders/[orderId]` by deriving the focus kitchen from the authenticated area.
4. MUST return `403` for wrong-area protected reads instead of relying on hidden UI controls.
5. SHOULD preserve the existing production read-model semantics for kitchens so later client work is mostly contract migration rather than domain redesign.
</requirements>

## Subtasks
- [x] 3.1 Extract or add a dedicated salão read model from the current production-service projections.
- [x] 3.2 Add `GET /api/salon` and enforce salão-only access before any refresh side effect runs.
- [x] 3.3 Protect `GET /api/board` with kitchen-only authorization that runs before `maybeRefreshRuntimeProviderSync()`.
- [x] 3.4 Protect `GET /api/orders/[orderId]`, normalize missing `kitchen` from the session area, and reject wrong-kitchen reads with `403`.
- [x] 3.5 Add or update tests proving unauthorized reads return before refresh work and that the new salão contract stays separate from kitchen board data.

## Implementation Details
Keep the existing production domain intact and focus on read-surface segregation plus auth-first route flow. See TechSpec sections `System Architecture`, `API Endpoints`, and `Testing Approach`.

### Relevant Files
- `src/application/production-service.ts` — Existing board, salão summary, and order-detail projections that need a dedicated salão contract.
- `app/api/board/route.ts` — Current public board route that currently triggers `maybeRefreshRuntimeProviderSync()` before any access control.
- `app/api/orders/[orderId]/route.ts` — Current detail read route that needs canonical kitchen behavior and auth-first ordering.
- `src/infrastructure/runtime-provider-sync-refresh.ts` — Side-effect boundary that must never run for denied requests.
- `app/api/provider-sync-routes.test.ts` — Established route-test style for side-effect-sensitive handler behavior.

### Dependent Files
- `app/salon/page.tsx` — Will switch to the new salão read contract in task 04.
- `src/components/kds/salon-client.tsx` — Will consume `/api/salon` in task 07.
- `src/components/kds/order-detail-client.tsx` — Will rely on canonical focus behavior in task 07.
- `e2e/order-detail.spec.ts` — Will need updated auth and route expectations after this task.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines kitchen versus salão scope.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires explicit server-side read protection before side effects.
- [ADR-004: Dual-Layer Authorization Validation with Vitest and Playwright](adrs/adr-004.md) — Requires proof for denied reads and route behavior.

## Deliverables
- New salão-only read contract and route.
- Protected kitchen board and order-detail read APIs with auth-before-refresh ordering.
- Canonical order-detail handler behavior for missing or wrong `kitchen` parameters.
- Unit tests for read-model segregation and handler branching.
- Integration tests proving denied requests never trigger `maybeRefreshRuntimeProviderSync()` and that authorized requests still return the expected payloads **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `GET /api/salon` returns only the salão contract shape and excludes kitchen board columns.
  - [x] `GET /api/orders/[orderId]` without a `kitchen` query resolves the focus kitchen from the authenticated area.
  - [x] `GET /api/orders/[orderId]?kitchen=kitchen-2` from a `kitchen-1` session returns `403`.
  - [x] `GET /api/board` from a salão session returns `403`.
- Integration tests:
  - [x] Missing-session access to `GET /api/board` returns `401` before `maybeRefreshRuntimeProviderSync()` is invoked.
  - [x] Wrong-area access to `GET /api/orders/[orderId]` returns `403` before `maybeRefreshRuntimeProviderSync()` is invoked.
  - [x] Authorized kitchen reads continue to expose the expected ticket and sync-exception data.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Kitchens and salão no longer share the same protected read API contract.
- Protected reads are enforced on the server before provider refresh or protected projection work begins.
