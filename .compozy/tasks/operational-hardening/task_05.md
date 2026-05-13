---
status: completed
title: "Enforce write authorization for kitchen mutations and salão acknowledge flows"
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 05: Enforce write authorization for kitchen mutations and salão acknowledge flows

## Overview
Protect every production mutation that remains in scope for the approved area model. This task makes wrong-area writes impossible by enforcing kitchen ownership on ticket and item mutations and salão-only access on sync-exception acknowledgment, all before repository or service side effects execute.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST protect `PATCH /api/orders/[orderId]/tickets/[kitchenId]` so only the matching kitchen area can start or complete that kitchen’s ticket.
2. MUST protect `PATCH /api/orders/[orderId]/items/[itemId]` so only the kitchen that owns the item can change its status.
3. MUST protect `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge` so only salão can acknowledge sync exceptions.
4. MUST run authorization before any repository mutation, sync-service call, or other write side effect.
5. SHOULD preserve existing `400` and `404` behavior after authorization succeeds so downstream API semantics remain stable.
</requirements>

## Subtasks
- [x] 5.1 Add kitchen-session enforcement to ticket mutation routes before `start` or `complete` actions execute.
- [x] 5.2 Add item-ownership enforcement to item mutation routes before status changes execute.
- [x] 5.3 Add salão-only enforcement to the sync-exception acknowledge route before the service call executes.
- [x] 5.4 Standardize `401/403` responses for denied mutation attempts across all protected write routes.
- [x] 5.5 Extend route tests to prove denied writes never reach repository mutation or acknowledge-service work.

## Implementation Details
Keep the existing write handlers testable and small by layering shared auth helpers in front of the current business logic. See TechSpec sections `API Endpoints`, `Testing Approach`, and `Technical Considerations`.

### Relevant Files
- `app/api/orders/[orderId]/tickets/[kitchenId]/route.ts` — Current kitchen-ticket mutation handler.
- `app/api/orders/[orderId]/items/[itemId]/route.ts` — Current item-status mutation handler.
- `app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts` — Current salão acknowledgment route that is still public.
- `app/api/orders/mutations.test.ts` — Existing mutation test harness for ticket and item routes.
- `app/api/provider-sync-routes.test.ts` — Existing test harness for the acknowledge route and related route-level patterns.

### Dependent Files
- `src/components/kds/dashboard-client.tsx` — Will rely on the protected ticket mutation behavior in task 07.
- `src/components/kds/order-detail-client.tsx` — Will rely on protected item and ticket mutations in task 07.
- `src/components/kds/salon-client.tsx` — Will rely on protected acknowledgment behavior in task 07.
- `e2e/order-detail.spec.ts` — Will need wrong-area mutation coverage after this task.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines the allowed production actions per area.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires write enforcement before side effects.
- [ADR-004: Dual-Layer Authorization Validation with Vitest and Playwright](adrs/adr-004.md) — Requires direct API misuse coverage.

## Deliverables
- Protected ticket, item, and acknowledge mutation routes.
- Shared or standardized authorization behavior for `401/403` mutation failures.
- Unit tests covering ownership and role-authorization branching on each mutation route.
- Integration tests proving denied requests never mutate repository state or invoke acknowledge side effects **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `PATCH /api/orders/[orderId]/tickets/kitchen-2` from a `kitchen-1` session returns `403`.
  - [x] `PATCH /api/orders/[orderId]/items/[itemId]` for an item owned by the other kitchen returns `403`.
  - [x] `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge` from a kitchen session returns `403`.
  - [x] Missing or invalid session on protected write routes returns `401`.
- Integration tests:
  - [x] Denied ticket mutations do not change any item or ticket statuses in the repository.
  - [x] Denied item mutations do not update `order_items.updated_at` or item status fields.
  - [x] Denied acknowledge attempts do not invoke the sync service or change exception status.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- No protected production mutation or acknowledgment path can be executed by the wrong area.
- Denied write requests fail before any repository or service side effect occurs.
