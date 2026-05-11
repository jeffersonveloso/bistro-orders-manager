# Phase 1 Real Integration Regression Suite

## Suite Summary

- Scope: Anota AI Phase 1 sync boundary and operator-facing exception flows
- Execution type: layered regression for the changed sync surface
- Expected duration:
  - Smoke: 10-15 minutes
  - Targeted: 30-45 minutes
  - Full run: 75-120 minutes plus live-environment evidence capture
- Primary risk: provider-side failures or post-import divergence can break operator trust even when the kitchen board still renders

## Artifact Generation Note

- This suite was created manually under the `qa-report` fallback described in `qa/test-plans/real-integration-qa-report-fallback.md`.
- Task 09 should execute this suite directly and update `qa/verification-report.md` with the final evidence set.

## Execution Order

1. Smoke
2. P0 sync intake and exception behavior
3. P1 reconciliation recovery and salão acknowledgment
4. Full verification gate and manual live-environment evidence

## Smoke Coverage

- `SMOKE-002` Live sync alert surfaces render on dashboard and remain visible from salão navigation

Smoke command baseline:

- `npm run test:e2e`

Stop conditions:

- App does not boot
- Dashboard or salão is unreachable
- Unresolved sync marker surfaces disappear from the seeded public flows

## Targeted Coverage

### P0

- `TC-INT-002` Confirmed webhook intake imports exactly once and ignores duplicate delivery
- `TC-INT-004` Missing mapping blocks import and opens `missing_mapping`
- `TC-INT-005` Operationally relevant provider changes open `changed_externally` without rewriting kitchen data
- `TC-INT-006` Provider cancellation opens `canceled_externally` without mutating imported production data

### P1

- `TC-INT-003` Reconciliation replay resolves `ingestion_failed` and `missing_mapping` after the root cause is fixed
- `TC-FUNC-003` Salão acknowledges an unresolved exception without clearing unresolved visibility

Targeted command baseline:

- `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts src/application/production-service.test.ts`
- `npm run test:e2e`

## Full-Run Coverage

The full regression run for this feature includes all targeted cases plus the broader repository gates and the existing public-surface regression baseline:

- `qa/test-plans/stage-4-targeted-regression.md`
- `qa/live-integration-post-qa-checklist.md`
- `npm run lint`
- `npm run test:run -- --coverage`
- `npm run build`
- `npm run test:e2e`

Manual evidence expected in the full run:

- Real reconciliation command details
- Real or simulated webhook evidence
- Screenshots for board alert banner, order detail sync trail, and salão acknowledgment state
- Final outcome log in `qa/verification-report.md`

## Automation Classification

| Case | Priority | Coverage Tier | Automation Target | Automation Status | Harness Reference |
|------|----------|---------------|-------------------|-------------------|------------------|
| `SMOKE-002` | P0 | Smoke | E2E | Existing | `npm run test:e2e` / `e2e/dashboard-smoke.spec.ts` |
| `TC-INT-002` | P0 | Targeted | Integration | Existing | `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts` |
| `TC-INT-003` | P1 | Targeted | Integration | Existing | `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts` |
| `TC-INT-004` | P0 | Targeted | Integration | Existing | `npm run test:run -- src/application/provider-sync-service.test.ts` |
| `TC-INT-005` | P0 | Targeted | Integration | Existing | `npm run test:run -- src/application/provider-sync-service.test.ts src/application/production-service.test.ts` |
| `TC-INT-006` | P0 | Targeted | Integration | Existing | `npm run test:run -- src/application/provider-sync-service.test.ts src/application/production-service.test.ts` |
| `TC-FUNC-003` | P1 | Targeted | E2E | Existing | `npm run test:e2e` / `e2e/salon-sync-exceptions.spec.ts` |

## Pass / Fail Rules

- PASS:
  - all P0 cases pass
  - at least 90% of P1 cases pass
  - no open Critical or High issue blocks intake, replay, exception visibility, or salão acknowledgment
- FAIL:
  - any P0 case fails
  - duplicate delivery creates a second order
  - missing mapping partially imports an order
  - provider change or cancellation rewrites kitchen production data
- CONDITIONAL:
  - only P1 or live-environment evidence gaps remain
  - the blocker, workaround, and follow-up are documented in `qa/verification-report.md`

## Task 09 Handoff

- Execute this suite together with `qa/live-integration-post-qa-checklist.md`.
- Prefer existing Vitest and Playwright coverage first, then capture any live-environment deltas manually.
- If a case fails during execution, record the defect under `qa/issues/` and update `qa/verification-report.md` before changing task status.
