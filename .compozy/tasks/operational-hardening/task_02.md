---
status: completed
title: "Build the `/access` entry flow and session lifecycle routes"
type: frontend
complexity: high
dependencies:
  - task_01
---

# Task 02: Build the `/access` entry flow and session lifecycle routes

## Overview
Create the operator entry point for the new area-based session model. This task is intentionally typed as `frontend` to match the allowed registry, but it is a full-stack slice: it includes the `/access` page, the login and logout route handlers, redirect allowlist enforcement, and the runtime configuration contract that the UI depends on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST add a dedicated `/access` flow that supports area selection, PIN entry, invalid-credential feedback, and existing-session redirect behavior.
2. MUST implement `POST /api/access/session` and `POST /api/access/logout` using the shared session infrastructure from task 01.
3. MUST validate `next` targets against the approved per-area allowlist and normalize order-detail redirects to the authenticated kitchen when `kitchen` is omitted.
4. MUST use environment-backed PIN and session configuration only; this task MUST NOT introduce a new credential-management UI or SQLite credential persistence.
5. SHOULD document the runtime env requirements in the repository docs that already describe local boot and operational configuration.
</requirements>

## Subtasks
- [x] 2.1 Create the `/access` page and area-selection form with clear feedback for invalid PIN or expired session cases.
- [x] 2.2 Add the session-creation route that validates the request body, area PIN, and `next` destination before issuing the cookie.
- [x] 2.3 Add the logout or switch-area route that clears the session cookie deterministically.
- [x] 2.4 Wire existing-session behavior so revisiting `/access` redirects to the canonical surface for the active area.
- [x] 2.5 Update minimal operator-facing docs for required env vars and the new entry flow.

## Implementation Details
Use the shared auth primitives from task 01 and keep redirect decisions server-owned. See TechSpec sections `System Architecture`, `Data Models`, and `API Endpoints`.

### Relevant Files
- `app/layout.tsx` — Shared shell entry point where the new access surface must fit the existing app structure.
- `app/globals.css` — Current design tokens and typography foundation for a new access experience that matches the operational UI.
- `app/providers.tsx` — Existing TanStack Query provider used by the app shell and a reference for what the access page does not need to overcomplicate.
- `src/components/ui/button.tsx` — Existing UI primitive that the access form should reuse.
- `README.md` — Current runtime configuration and startup instructions that should gain the new access env contract.

### Dependent Files
- `app/page.tsx` — Will redirect unauthenticated users into `/access` in task 04.
- `app/api/board/route.ts` — Will assume sessions are issued by the new login route in task 03.
- `e2e/dashboard-smoke.spec.ts` — Will need to authenticate through `/access` after this flow lands.
- `qa/test-plans/` — Later QA planning tasks will reference the new access entry path and env prerequisites.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines the per-area access model.
- [ADR-002: Signed Area Session Cookie with Dedicated Access Entry](adrs/adr-002.md) — Defines the entry flow, cookie issuance, and redirect constraints.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Requires the session lifecycle to feed explicit route and page guards.

## Deliverables
- New `/access` page with area selection and PIN submission.
- New login and logout route handlers using the shared cookie session infrastructure.
- `next` allowlist and canonical redirect behavior for all approved area destinations.
- Documentation updates for required access env vars and operator entry expectations.
- Unit tests covering request validation, invalid PIN handling, cookie issuance, and logout behavior.
- Integration tests covering existing-session redirect behavior and allowlist fallback behavior **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] `POST /api/access/session` with an invalid `areaId` returns `400`.
  - [x] `POST /api/access/session` with a wrong PIN returns `401` and does not set a cookie.
  - [x] `POST /api/access/session` with a disallowed `next` falls back to the canonical area home.
  - [x] `POST /api/access/logout` clears the access cookie and returns `204`.
- Integration tests:
  - [x] Visiting `/access` with a valid existing kitchen session redirects to `/`.
  - [x] Visiting `/access` with a valid existing salão session redirects to `/salon`.
  - [x] Logging in with `next=/orders/order_anota-101` normalizes to the authenticated kitchen detail route.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Operators can establish and clear area sessions only through the new `/access` flow.
- Redirect behavior is server-owned, allowlisted, and consistent with the approved area matrix.
