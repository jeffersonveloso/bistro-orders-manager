---
status: completed
title: "Protect server pages and canonical area redirects"
type: frontend
complexity: high
dependencies:
  - task_02
  - task_03
---

# Task 04: Protect server pages and canonical area redirects

## Overview
Apply the new access model to the App Router surfaces themselves, not only to the underlying APIs. This task ensures each protected page authenticates and authorizes the area before protected work runs, redirects unauthenticated users to `/access`, and redirects authenticated users to the canonical surface for their area when they open the wrong page.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST protect `app/page.tsx`, `app/salon/page.tsx`, `app/orders/[orderId]/page.tsx`, and `app/catalog/page.tsx` with server-side area checks.
2. MUST run page guards before `maybeRefreshRuntimeProviderSync()` or any other protected server-side side effect already present in the page.
3. MUST redirect unauthenticated users to `/access` and authenticated users to their canonical surface when they open the wrong protected page.
4. MUST treat `/catalog` as deferred in this phase by protecting it and redirecting all current Stage 6 areas away from it.
5. SHOULD preserve existing page data bootstrapping after authorization so client hydration stays compatible with the current UI architecture.
</requirements>

## Subtasks
- [x] 4.1 Protect the kitchen board page and ensure auth runs before board refresh work.
- [x] 4.2 Protect the salão page and ensure auth runs before salão refresh work.
- [x] 4.3 Protect the order-detail page and normalize the focus kitchen to the authenticated area before protected work.
- [x] 4.4 Protect the catalog page and redirect all current areas to their canonical operational home.
- [x] 4.5 Add or update tests that prove redirect decisions and auth-before-side-effect ordering for protected pages.

## Implementation Details
Keep redirects server-owned and deterministic. See TechSpec sections `System Architecture`, `API Endpoints`, `Impact Analysis`, and `Development Sequencing`.

### Relevant Files
- `app/page.tsx` — Current kitchen board page that runs protected refresh work immediately.
- `app/salon/page.tsx` — Current salão page that still shares the board payload and needs auth-first flow.
- `app/orders/[orderId]/page.tsx` — Current order-detail page that derives `kitchen` from URL state and needs canonical area behavior.
- `app/catalog/page.tsx` — Current public catalog surface that must be deferred and redirected away for current roles.
- `next/navigation` usage in existing pages — Existing redirect and `notFound` patterns that should remain idiomatic in the App Router.

### Dependent Files
- `src/components/kds/dashboard-client.tsx` — Will receive already-authorized page data in task 07.
- `src/components/kds/salon-client.tsx` — Will rely on authorized salão-page bootstrapping in task 07.
- `e2e/dashboard-smoke.spec.ts` — Will need new auth and redirect expectations.
- `e2e/order-detail.spec.ts` — Will need coverage for canonical order-detail routing after login.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines which areas are allowed on which surfaces.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires explicit page-level enforcement before side effects.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Defines the catalog deferral behavior.

## Deliverables
- Protected App Router pages for board, salão, order detail, and catalog.
- Canonical redirects for unauthenticated and wrong-area page access.
- Auth-before-side-effect ordering in pages that currently call `maybeRefreshRuntimeProviderSync()`.
- Unit or helper tests for redirect rules and page authorization branching.
- Integration tests covering protected page redirects, canonical route behavior, and deferred catalog access **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Unauthenticated access to `app/page.tsx` redirects to `/access`.
  - [x] Salão session opening `/` redirects to `/salon`.
  - [x] Kitchen session opening `/orders/order_anota-101` without `kitchen` canonicalizes to that kitchen’s detail view.
  - [x] Any current area opening `/catalog` is redirected to its canonical home.
- Integration tests:
  - [x] Protected pages do not call `maybeRefreshRuntimeProviderSync()` before auth succeeds.
  - [x] Authorized kitchen page loads still bootstrap initial board or detail data after redirect handling.
  - [x] Salão page loads only for a salão session and rejects kitchen sessions through redirect behavior.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Every protected App Router surface enforces the area matrix before protected work runs.
- Wrong-area users are redirected to the correct surface instead of seeing partial content or triggering hidden side effects.
