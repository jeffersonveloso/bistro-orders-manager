---
status: completed
title: "Protect and defer catalog APIs behind the auth matrix"
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 06: Protect and defer catalog APIs behind the auth matrix

## Overview
Close the remaining public write-capable escape hatch that would otherwise bypass the new operational boundary. This task puts the catalog APIs behind the same session stack as the protected operational routes and intentionally denies the current Stage 6 roles so catalog administration is explicitly deferred.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST protect `GET /api/catalog/mappings`, `POST /api/catalog/mappings`, and `POST /api/catalog/provider-pull` with the same session and area guard stack used by the protected operational APIs.
2. MUST return `403` for `kitchen-1`, `kitchen-2`, and `salon` on these catalog APIs after authentication succeeds.
3. MUST return before any provider pull, replay, repository write, or other catalog-related side effect runs when the request is denied.
4. MUST preserve the explicit deferred status of catalog administration for this phase rather than silently exposing a partial capability.
5. SHOULD keep the route contracts stable enough that a future admin or manager scope can reuse them instead of replacing them.
</requirements>

## Subtasks
- [x] 6.1 Add session enforcement to the catalog mapping GET and POST routes.
- [x] 6.2 Add session enforcement to the provider-assisted catalog pull route.
- [x] 6.3 Apply explicit `403` policy for all current Stage 6 areas on all catalog APIs.
- [x] 6.4 Add or update tests proving denied catalog access returns before provider or repository side effects execute.

## Implementation Details
This task implements the ADR-driven catalog deferral without introducing a new admin role. See TechSpec sections `System Architecture`, `API Endpoints`, and `Technical Considerations`.

### Relevant Files
- `app/api/catalog/mappings/route.ts` — Current public route that can read and write local mappings and trigger replay behavior.
- `app/api/catalog/provider-pull/route.ts` — Current public route that can query the provider catalog for new items.
- `src/application/catalog-mapping-service.ts` — Existing mapping and replay behavior that denied requests must not reach.
- `src/application/catalog-provider-assistance-service.ts` — Existing provider-assistance surface referenced by the catalog routes.
- `app/catalog/page.tsx` — Protected separately in task 04, but relevant for understanding the deferred catalog surface end to end.

### Dependent Files
- `src/components/kds/dashboard-client.tsx` — Will stop advertising `/catalog` in task 07.
- `src/components/kds/salon-client.tsx` — Will stop advertising `/catalog` in task 07.
- `qa/test-plans/` — QA tasks must explicitly include deferred catalog coverage after this task lands.

### Related ADRs
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires explicit handler-level enforcement.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Defines the catalog deferral and denial behavior.

## Deliverables
- Protected catalog mapping and provider-pull APIs.
- Explicit denial behavior for all current Stage 6 areas.
- Unit tests covering authenticated and unauthenticated denial behavior for catalog APIs.
- Integration tests proving denied requests never reach provider-assisted pull work, mapping upsert work, or replay side effects **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Missing session on `GET /api/catalog/mappings` returns `401`.
  - [x] Authenticated `kitchen-1` access to `GET /api/catalog/mappings` returns `403`.
  - [x] Authenticated `salon` access to `POST /api/catalog/mappings` returns `403`.
  - [x] Authenticated `kitchen-2` access to `POST /api/catalog/provider-pull` returns `403`.
- Integration tests:
  - [x] Denied `POST /api/catalog/provider-pull` does not invoke provider catalog pull work.
  - [x] Denied `POST /api/catalog/mappings` does not persist mappings or trigger replay behavior.
  - [x] Denied `GET /api/catalog/mappings` does not prepare the protected catalog payload beyond authorization checks.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Catalog APIs are no longer a public escape hatch around the operational boundary.
- Current Stage 6 roles are explicitly denied rather than implicitly unsupported.
