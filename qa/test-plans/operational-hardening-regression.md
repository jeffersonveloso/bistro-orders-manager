# Operational Hardening Regression Suite

## Suite Summary

- Scope: area authentication, protected operational surfaces, wrong-area denial behavior, and deferred catalog blocking
- Execution type: layered regression for the changed access-control surface
- Expected duration:
  - Smoke: 10-15 minutes
  - Targeted: 25-40 minutes
  - Full run: 60-90 minutes plus task 09 evidence capture
- Primary risk: a shared-device auth regression could allow the wrong area to read or mutate production, or could trigger protected side effects before denial

## Artifact Generation Note

- This suite was created manually under the `qa-report` manual-path note described in `qa/test-plans/operational-hardening-qa-report-fallback.md`.
- Task 09 should execute this suite directly and update `qa/verification-report.md` with the final evidence set.

## Execution Order

1. Smoke
2. P0 access-contract, protected-read, protected-write, and deferred-catalog behavior
3. P1 logout and session-lifecycle behavior
4. Full verification gate and final QA evidence update

## Smoke Coverage

- `SMOKE-003` Area login reaches the canonical kitchen surface and keeps `/access` session-aware

Smoke command baseline:

- `npm run test:e2e`

Stop conditions:

- `/access` is unreachable
- valid login cannot reach `/` or `/salon`
- protected pages load without the expected redirect or canonical surface behavior

## Targeted Coverage

### P0

- `TC-INT-007` Access login rejects invalid PINs and disallowed `next` targets while normalizing valid order-detail redirects
- `TC-INT-009` Wrong-area and unauthenticated protected reads fail before refresh or cross-kitchen detail work
- `TC-INT-010` Wrong-area protected writes fail before repository mutation or sync-service acknowledgement work
- `TC-INT-011` Guard helpers and protected handlers deny access before protected callback, refresh, or catalog work starts
- `TC-INT-012` Deferred catalog page and APIs remain blocked for all current areas

### P1

- `TC-FUNC-004` Logout clears the session and forces protected surfaces back through `/access`
- `TC-INT-008` Session persistence, renewal, and expiry behavior remain consistent on shared-device navigation

Targeted command baseline:

- `npm run test:run -- app/api/access/session/route.test.ts app/api/access/logout/route.test.ts app/api/_lib/area-access-route.test.ts app/api/protected-read-routes.test.ts app/api/orders/mutations.test.ts app/api/provider-sync-routes.test.ts app/api/catalog/routes.test.ts app/protected-pages.test.ts src/infrastructure/area-session.test.ts`
- `npm run test:e2e`

## Full-Run Coverage

The full regression run for this feature includes all targeted cases plus the broader repository verification gate and the existing protected-surface browser baseline:

- `e2e/access-flow.spec.ts`
- `e2e/dashboard-smoke.spec.ts`
- `e2e/order-detail.spec.ts`
- `e2e/salon-sync-exceptions.spec.ts`
- `npm run lint`
- `npm run test:run -- --coverage`
- `npm run build`
- `npm run test:e2e`

Manual evidence expected in the full run:

- confirmation that denied reads do not trigger `maybeRefreshRuntimeProviderSync()`
- confirmation that denied writes do not trigger repository mutation or sync-service calls
- screenshots or notes for any runtime redirect or blocked-surface delta observed during task 09
- final outcome log in `qa/verification-report.md`

## Automation Classification

| Case | Priority | Coverage Tier | Automation Target | Automation Status | Harness Reference |
|------|----------|---------------|-------------------|-------------------|------------------|
| `SMOKE-003` | P0 | Smoke | E2E | Existing | `npm run test:e2e` / `e2e/access-flow.spec.ts`, `e2e/dashboard-smoke.spec.ts` |
| `TC-INT-007` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/access/session/route.test.ts` |
| `TC-FUNC-004` | P1 | Targeted | Integration | Existing | `npm run test:run -- app/api/access/logout/route.test.ts app/protected-pages.test.ts` |
| `TC-INT-008` | P1 | Targeted | Integration | Existing | `npm run test:run -- src/infrastructure/area-session.test.ts app/protected-pages.test.ts app/api/_lib/area-access-route.test.ts` |
| `TC-INT-009` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/protected-read-routes.test.ts` |
| `TC-INT-010` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/orders/mutations.test.ts app/api/provider-sync-routes.test.ts` |
| `TC-INT-011` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/_lib/area-access-route.test.ts app/api/protected-read-routes.test.ts app/api/catalog/routes.test.ts` |
| `TC-INT-012` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/catalog/routes.test.ts` plus `npm run test:e2e` / `e2e/access-flow.spec.ts` |

## Pass / Fail Rules

- PASS:
  - all P0 cases pass
  - at least 90% of P1 cases pass
  - no open Critical or High issue blocks login, denial behavior, session handling, or catalog deferral
- FAIL:
  - any P0 case fails
  - a wrong-area read succeeds
  - a wrong-area write succeeds
  - a denied request still triggers refresh, repository mutation, or catalog provider work
- CONDITIONAL:
  - only P1 or environment-specific evidence gaps remain
  - the blocker, workaround, and follow-up are documented in `qa/verification-report.md`

## Task 09 Handoff

- Execute this suite before changing task 09 status.
- Prefer existing Vitest and Playwright coverage first, then capture any runtime-only deltas manually.
- If any case fails, record the issue under `qa/issues/` and update `qa/verification-report.md` before claiming completion.
