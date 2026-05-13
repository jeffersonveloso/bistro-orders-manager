---
status: completed
title: "Align operator clients with protected surfaces and salão contract"
type: frontend
complexity: high
dependencies:
  - task_03
  - task_04
  - task_05
  - task_06
---

# Task 07: Align operator clients with protected surfaces and salão contract

## Overview
Update the operator-facing clients so they match the new protected server contracts and area boundaries. This task keeps the kitchen and salão experiences operationally fast while removing shortcuts that would undermine the new access model or point operators toward deferred surfaces.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST update `dashboard-client`, `salon-client`, and `order-detail-client` to work against the protected route set and the new salão-specific API contract.
2. MUST move salão reads from `/api/board` to `/api/salon`.
3. MUST remove or suppress operational shortcuts between surfaces that are no longer valid in the area model, including catalog access.
4. MUST preserve cross-kitchen visibility within the authorized kitchen detail and board experience without exposing wrong-area actions.
5. SHOULD surface authorization failures gracefully if a session expires during polling or mutation flows.
</requirements>

## Subtasks
- [x] 7.1 Update the dashboard client for the protected board flow and active-kitchen behavior.
- [x] 7.2 Update the salão client to consume `/api/salon` and keep acknowledgment behavior aligned with the protected route set.
- [x] 7.3 Update the order-detail client to rely on the authorized focus kitchen and protected mutation routes.
- [x] 7.4 Remove invalid cross-surface and deferred catalog shortcuts from the operator UIs.
- [x] 7.5 Add or update browser and client-facing tests for the protected UX flows.

## Implementation Details
This task is a contract-alignment pass, not a visual redesign. See TechSpec sections `System Architecture`, `Impact Analysis`, and `Testing Approach`.

### Relevant Files
- `src/components/kds/dashboard-client.tsx` — Current board client still exposes `/salon` and `/catalog` shortcuts and uses the unprotected board contract.
- `src/components/kds/salon-client.tsx` — Current salão client still fetches `/api/board` and exposes `/catalog`.
- `src/components/kds/order-detail-client.tsx` — Current detail client uses order reads and mutations that will become area-protected.
- `src/lib/fetch-json.ts` — Shared fetch helper and a likely place to preserve consistent handling of protected-route error responses.
- `e2e/dashboard-smoke.spec.ts` — Existing browser smoke path for board-to-salão navigation that will need new auth-aware expectations.

### Dependent Files
- `e2e/order-detail.spec.ts` — Will need updated assertions for authenticated detail flows and blocked wrong-area behavior.
- `e2e/salon-sync-exceptions.spec.ts` — Will need to authenticate through the salão path and keep acknowledgment assertions valid.
- `qa/test-cases/` — QA planning tasks will reference the updated operator flows and removed shortcuts.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines the intended operator surfaces.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires the clients to align with protected server contracts.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Requires removal of catalog shortcuts from operator clients.

## Deliverables
- Updated board, salão, and order-detail clients aligned with the protected route set.
- Salão client migrated to the dedicated `/api/salon` contract.
- Removal of invalid operational shortcuts, especially `/catalog`.
- Unit tests or component-contract tests for client error and data handling where applicable.
- Integration tests covering authenticated browser flows and protected-route client interactions **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `salon-client` fetches `/api/salon` instead of `/api/board`.
  - [x] `dashboard-client` no longer exposes a `/catalog` shortcut.
  - [x] `order-detail-client` keeps mutation invalidation aligned with the protected order and board query keys.
  - [x] Protected client flows surface an actionable fallback when a session-protected request fails.
- Integration tests:
  - [x] Authenticated kitchen board flow still opens the matching order detail and preserves cross-kitchen visibility.
  - [x] Authenticated salão flow still acknowledges sync exceptions through the protected route.
  - [x] Operator UIs no longer offer shortcuts to deferred or wrong-area surfaces.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Operator clients reflect the approved area matrix and the new protected route contracts.
- Kitchens and salão retain fast operational flows without links or fetches that bypass the new boundary.
