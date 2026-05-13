---
status: completed
title: "Define area access policies, session cookie, and shared guard infrastructure"
type: backend
complexity: high
dependencies: []
---

# Task 01: Define area access policies, session cookie, and shared guard infrastructure

## Overview
Establish the reusable authorization foundation for Operational Hardening before any page or API is protected. This task introduces the area-domain rules, signed cookie session utilities, and shared guard helpers that later tasks will consume so the auth matrix is enforced consistently and before protected side effects run.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST introduce dedicated area-access types and policy helpers in isolated modules rather than leaking role logic into `src/domain/production.ts`.
2. MUST implement signed session cookie utilities that honor the approved policy: `HttpOnly`, `SameSite=Lax`, `Secure` outside development, `Path=/`, TTL-based `Max-Age`, and sliding renewal only inside the renewal window.
3. MUST provide shared server-side guard helpers that can distinguish `401` from `403` and can be invoked before any protected side effect such as `maybeRefreshRuntimeProviderSync()` or repository mutation work.
4. MUST keep the implementation compatible with the existing App Router, route-handler style, and current `better-sqlite3` persistence without introducing a new database table for credentials or sessions.
5. SHOULD mirror the repository’s existing route helper conventions so later protected endpoints remain small and testable.
</requirements>

## Subtasks
- [x] 1.1 Add the area identity model, canonical area-to-surface rules, and kitchen versus salão policy helpers.
- [x] 1.2 Add session parsing, signing, verification, expiry, and renewal-window helpers for the approved cookie policy.
- [x] 1.3 Add shared route-level auth utilities for extracting the session, returning standardized `401/403` responses, and enforcing auth-before-side-effect ordering.
- [x] 1.4 Add configuration loading for access env vars and explicit failures for missing or invalid runtime configuration.
- [x] 1.5 Add or update tests that prove policy decisions, cookie integrity rules, and guard ordering expectations.

## Implementation Details
Create the minimum shared auth surface needed by the approved TechSpec. See TechSpec sections `Core Interfaces`, `Data Models`, `API Endpoints`, and `Technical Considerations`.

### Relevant Files
- `src/domain/production.ts` — Existing kitchen identifiers and production-domain boundaries that the area model must align with without polluting production logic.
- `src/application/ports.ts` — Reference point for keeping application-layer boundaries narrow if helper contracts need shared typing.
- `app/api/_lib/provider-sync-route.ts` — Existing route-helper style for standardized JSON responses and guardable request parsing.
- `src/infrastructure/runtime-provider-sync-refresh.ts` — Protected routes must explicitly guard before this operational side effect is ever triggered.
- `.compozy/tasks/operational-hardening/_techspec.md` — Canonical source for cookie policy, renewal behavior, and auth-before-side-effect rules.

### Dependent Files
- `app/api/access/session/route.ts` — Will depend on the session and policy utilities in task 02.
- `app/api/board/route.ts` — Will consume auth-first guard helpers in task 03.
- `app/api/orders/[orderId]/items/[itemId]/route.ts` — Will rely on shared authorization helpers in task 05.
- `app/api/catalog/mappings/route.ts` — Will join the same auth matrix in task 06.
- `app/page.tsx` — Will use page-level authorization behavior in task 04.

### Related ADRs
- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Defines the first-release area model.
- [ADR-002: Signed Area Session Cookie with Dedicated Access Entry](adrs/adr-002.md) — Defines the cookie transport, policy, and renewal expectations.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Defines explicit auth enforcement and auth-before-side-effect ordering.
- [ADR-004: Dual-Layer Authorization Validation with Vitest and Playwright](adrs/adr-004.md) — Requires low-level proof for these shared helpers.

## Deliverables
- New or updated area-access domain and application support modules aligned with the approved TechSpec.
- Signed session cookie infrastructure with explicit policy defaults and renewal-window behavior.
- Shared route guard helpers for `401/403` decisions and auth-before-side-effect enforcement.
- Unit tests covering policy helpers, cookie validation, expiry, and renewal-window logic.
- Integration tests proving guard helpers return before protected side effects or downstream work **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Area policy helper returns the correct canonical surface for `kitchen-1`, `kitchen-2`, and `salon`.
  - [x] Session verifier rejects malformed signatures, expired sessions, and unsupported version payloads.
  - [x] Renewal helper reissues cookies only when remaining TTL is inside the configured final 25% window.
  - [x] Missing access env configuration returns a deterministic configuration error instead of silently accepting requests.
- Integration tests:
  - [x] Shared auth guard returns `401` for a missing session before any protected callback work executes.
  - [x] Shared auth guard returns `403` for wrong-area access before any protected callback work executes.
  - [x] Existing route-helper patterns remain compatible with the new auth utility surface.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Shared area policy and session infrastructure exist in dedicated modules and are reusable by pages and route handlers.
- Cookie policy, renewal behavior, and auth-before-side-effect rules are enforced in code rather than implied by documentation.
