## SMOKE-002: Sync Alert Surfaces Stay Reachable In Public Flows

**Priority:** P0 (Critical)
**Type:** Functional
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/dashboard-smoke.spec.ts`
**Automation Notes:** Existing Playwright smoke coverage already asserts the dashboard alert strip, ticket sync marker, and salão navigation flow.

### Objective

Verify that the seeded unresolved sync exception remains visible in the board and salão surfaces so operators can notice a live-integration issue without leaving the public workflow.

### Preconditions

- [ ] Local app starts successfully
- [ ] The seeded sync-exception scenario is available in the database
- [ ] Browser session has no prior app-state dependency

### Test Steps

1. Open `/`
   **Expected:** The dashboard loads with the heading `Sync board para duas cozinhas`

2. Inspect the board alert strip
   **Expected:** An unresolved sync alert banner is visible and includes `Falha de sincronização`

3. Inspect the mixed-order sync marker
   **Expected:** The ticket marker for `order_anota-101` shows `Mudança externa`

4. Click `Visão do salão`
   **Expected:** The browser navigates to `/salon`

5. Inspect the salão exception card
   **Expected:** The order-level sync exception remains visible and uses consolidated status language suitable for salão

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Fresh database boot | No pre-existing DB file | The seeded alert scenario still renders |
| Read-only surface | `/salon` | The exception is visible without exposing kitchen mutation controls |

### Traceability

- Requirement IDs: `PH1-P1-02`, `PH1-P1-03`
- PRD / TechSpec: unresolved exception visibility, minimal sync trail ownership, operator-facing sync alerts
- ADRs: `ADR-002`, `ADR-003`

### Notes

- This smoke case is the front-door signal that the exception surfaces are still operational before running the deeper API and reconciliation checks.
