# Stage 4 Targeted Regression Suite

## Suite Summary

- Scope: Stage 4 stability and acceptance coverage
- Execution type: Targeted regression
- Expected duration: 20-35 minutes
- Primary risk: public production flows lacked E2E coverage before this cycle

## Execution Order

1. Smoke
2. P0 functional and integration
3. P1 salon and single-kitchen regression
4. Manual-only visual judgment

## Suite Composition

### Smoke

- `SMOKE-001` Dashboard loads, exposes two kitchens, and navigates to salon

### P0

- `TC-FUNC-001` Order detail deep link preserves cross-kitchen visibility and action flow
- `TC-INT-001` Board and order APIs expose seeded statuses and stable payload shape

### P1

- `TC-FUNC-002` Single-kitchen order does not depend on the other kitchen
- `TC-UI-001` Salon uses one consolidated status per order and remains readable

## Automation Classification

- `SMOKE-001`: `E2E`
- `TC-FUNC-001`: `E2E`
- `TC-INT-001`: `E2E`
- `TC-FUNC-002`: `E2E`
- `TC-UI-001`: `Manual-only`

## Pass / Fail Rules

- PASS: all P0 pass, at least one smoke browser flow passes, no scoped High/Critical bugs remain
- FAIL: any P0 fails, app does not boot, or seeded public flows are inconsistent
- CONDITIONAL: only manual-only visual concerns remain and are documented with workaround

## Automation Follow-up

- Canonical command target: `npm run test:e2e`
- Required browser: Chromium
- Coverage expectation for this cycle:
  - dashboard smoke
  - salon navigation
  - order detail mutation flow
  - API payload verification

