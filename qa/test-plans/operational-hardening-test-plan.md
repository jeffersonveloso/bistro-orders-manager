# Operational Hardening QA Test Plan

## Executive Summary

This plan covers the Operational Hardening access-control surface for Vó Ziluca: area login, logout, session persistence, protected page and API access, wrong-area mutation blocking, auth-before-side-effect guarantees, and the deferred catalog surface. The objective is to give task 09 a complete QA package for P0 and P1 coverage without inventing a new QA framework or relying on undocumented operator behavior.

The highest release risk is not visual polish. It is boundary failure on shared devices: a wrong-area read, wrong-area write, or unauthorized request that reaches provider refresh, repository mutation, or catalog work would undermine the entire hardening slice. This plan therefore treats denied access and side-effect ordering as release-critical behavior alongside the happy-path access flow.

## Artifact Generation Note

- Requested workflow: use the installed `qa-report` skill with the repository root as the `qa-output-path`.
- Execution result for task 08: the skill is available as workflow guidance plus interactive shell scripts, but no callable non-interactive generator or QA MCP endpoint is exposed in this environment.
- Equivalent artifacts were created manually under `./qa/` following the `qa-report` structure, existing repository conventions, and current Playwright plus Vitest harnesses.
- See `qa/test-plans/operational-hardening-qa-report-fallback.md` for the explicit fallback record.

## Scope

### In Scope

- `/access`
- `POST /api/access/session`
- `POST /api/access/logout`
- Protected pages:
  - `/`
  - `/salon`
  - `/orders/[orderId]`
  - `/catalog`
- Protected read APIs:
  - `GET /api/board`
  - `GET /api/salon`
  - `GET /api/orders/[orderId]`
- Protected write APIs:
  - `PATCH /api/orders/[orderId]/tickets/[kitchenId]`
  - `PATCH /api/orders/[orderId]/items/[itemId]`
  - `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`
- Deferred catalog APIs:
  - `GET /api/catalog/mappings`
  - `POST /api/catalog/mappings`
  - `POST /api/catalog/provider-pull`
- P0 and P1 flows for:
  - area login
  - logout or switch-area behavior
  - session persistence and expiry handling
  - wrong-area read blocking
  - wrong-area write blocking
  - auth-before-side-effect ordering
  - deferred catalog access
- Existing automation alignment with:
  - Playwright specs under `e2e/`
  - Vitest route, page, and infrastructure tests under `app/` and `src/`

### Out of Scope

- Manager or admin roles beyond the current area matrix
- PIN rotation operations or production credential distribution
- Reopening catalog administration for any current area
- New QA frameworks, browser runners, or external API collections
- Figma or visual-baseline validation for this hardening slice

## Operational Hardening Requirement Map

| Requirement ID | Priority | Requirement | Primary Sources |
|----------------|----------|-------------|-----------------|
| `OH-P0-01` | P0 | Area login accepts only valid area credentials, rejects invalid PIN or invalid `next`, and redirects users to the canonical authorized surface. | PRD Goals, ADR-002, TechSpec API Endpoints |
| `OH-P0-02` | P0 | Wrong-area or unauthenticated protected reads must return `401/403` or canonical redirects before protected refresh or read-model work runs. | PRD Core Features, ADR-003, ADR-004 |
| `OH-P0-03` | P0 | Wrong-area or unauthenticated protected writes must fail before repository mutation or sync-service side effects run. | PRD Success Metrics, ADR-003, ADR-004 |
| `OH-P0-04` | P0 | Guard helpers and protected handlers must enforce auth-before-side-effect behavior for refresh, callback, provider, and catalog work. | TechSpec Testing Approach, Monitoring and Observability, ADR-003 |
| `OH-P0-05` | P0 | Catalog page and catalog APIs remain blocked for `kitchen-1`, `kitchen-2`, and `salon` in this release. | ADR-005, TechSpec Catalog Scope Rule |
| `OH-P1-01` | P1 | Explicit logout or switch-area clears the session deterministically and forces re-entry on the next protected request. | PRD User Experience, ADR-002 |
| `OH-P1-02` | P1 | Sessions persist through routine navigation, renew only in the configured window, and redirect expired users back through `/access`. | PRD High-Level Constraints, ADR-002, TechSpec Session Renewal Policy |
| `OH-P1-03` | P1 | Canonical redirects keep shared-device operators on the correct area surface without exposing cross-area shortcuts. | PRD User Experience, ADR-003, Task 07 outcomes |

## Test Strategy And Approach

- Use the existing Playwright suite for area-authenticated browser flows and canonical redirects:
  - `e2e/access-flow.spec.ts`
  - `e2e/dashboard-smoke.spec.ts`
  - `e2e/order-detail.spec.ts`
  - `e2e/salon-sync-exceptions.spec.ts`
- Use the existing Vitest suites for deterministic auth contract, handler ordering, and route-protection checks:
  - `app/api/access/session/route.test.ts`
  - `app/api/access/logout/route.test.ts`
  - `app/api/_lib/area-access-route.test.ts`
  - `app/api/protected-read-routes.test.ts`
  - `app/api/orders/mutations.test.ts`
  - `app/api/provider-sync-routes.test.ts`
  - `app/api/catalog/routes.test.ts`
  - `app/protected-pages.test.ts`
  - `src/infrastructure/area-session.test.ts`
- Treat task 09 as the execution phase that produces fresh commands, screenshots, timestamps, warnings, and verdicts in `qa/verification-report.md`.
- Keep route-level side-effect assertions and browser-level operator-path assertions both in scope. The hardening feature is incomplete if either layer regresses.

## Automation Strategy

- Do not introduce Cypress, Postman collections, Selenium, or ad hoc auth scripts for this feature.
- Browser-visible entry, redirect, and authorized operator flows should stay on the existing Playwright harness through `npm run test:e2e`.
- Handler, page, and infrastructure safety checks should stay on the existing Vitest harness through `npm run test:run -- ...`.
- When a flow already has code-level automation but still needs runtime proof, mark it as `Existing` and have task 09 capture fresh evidence rather than redefining the flow as manual-only.
- Manual follow-up remains limited to task 09 evidence capture, issue documentation, and any environment-specific deltas that cannot be reproduced in deterministic local automation.

## Environment Requirements

- macOS or Linux development environment
- Node.js with project dependencies installed
- Local SQLite filesystem access
- Playwright Chromium installed for browser execution
- Access runtime environment variables:
  - `BISTRO_ACCESS_SESSION_SECRET`
  - `BISTRO_ACCESS_PIN_KITCHEN_1`
  - `BISTRO_ACCESS_PIN_KITCHEN_2`
  - `BISTRO_ACCESS_PIN_SALON`
  - optional `BISTRO_ACCESS_SESSION_TTL_HOURS`
  - `BISTRO_DATABASE_PATH`
- Repository root write access so artifacts stay under `./qa/`

## Entry Criteria

- The Operational Hardening routes, pages, and guards from tasks 01 through 07 exist in the working tree.
- The repository boots locally and the seeded auth-protected flows are available.
- Playwright access and operator-flow coverage remains available under `e2e/`.
- Vitest coverage remains available for login, logout, protected reads, protected writes, guard ordering, and catalog deferral.
- Task 09 has a defined QA environment or an explicitly documented local fallback execution path.

## Exit Criteria

- All planned P0 cases pass.
- At least 90% of planned P1 cases pass.
- No unresolved Critical or High issue blocks area login, access denial, session handling, wrong-area write protection, or catalog deferral.
- `qa/verification-report.md` contains fresh execution evidence, commands, exit codes, warnings, and verdicts for task 09.
- Any environment blocker or manual-only delta is documented explicitly instead of being implied resolved.

## Monitoring And Observability Checks

- Runtime log events expected by this feature:
  - `area_login_success`
  - `area_login_failure`
  - `area_access_denied`
  - `area_session_expired`
  - `area_session_renewed`
  - `area_logout`
- Operator-visible observability:
  - redirects back to `/access` or a canonical home when the operator is on the wrong surface
  - preserved sync markers and kitchen context after authorized navigation
  - no catalog shortcut exposure from kitchen or salão surfaces
- Execution evidence documents:
  - `qa/test-plans/operational-hardening-regression.md`
  - `qa/verification-report.md`

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| A denied request still triggers provider refresh or repository work | Medium | Critical | Keep handler and guard ordering cases in P0 and require task 09 evidence for blocked side effects |
| Session expiry or renewal regresses on shared devices | Medium | High | Keep page and session-renewal coverage explicit in P1 with route plus infrastructure evidence |
| Wrong-area redirects drift from API denial behavior | Medium | High | Reuse shared guards and cover both page and API behavior with existing Playwright and Vitest suites |
| Catalog deferral regresses into a public escape hatch | Low | Critical | Keep catalog page and API denial cases in P0 and reference ADR-005 directly |
| QA artifacts drift into unsupported automation instructions | Medium | Medium | Validate the package with Vitest against only existing `npm run test:e2e` and `npm run test:run --` harnesses |

## Timeline And Deliverables

- Deliver the Operational Hardening QA plan in `qa/test-plans/operational-hardening-test-plan.md`
- Deliver detailed area-auth, guard, and deferred-catalog test cases in `qa/test-cases/`
- Deliver the regression suite in `qa/test-plans/operational-hardening-regression.md`
- Preserve the explicit manual-path note in `qa/test-plans/operational-hardening-qa-report-fallback.md`
- Use task 09 to execute this plan and refresh `qa/verification-report.md`
