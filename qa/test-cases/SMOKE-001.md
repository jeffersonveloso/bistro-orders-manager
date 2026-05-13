## SMOKE-001: Dashboard Smoke And Salon Navigation

**Priority:** P0 (Critical)
**Type:** Functional
**Status:** Pass
**Estimated Time:** 5 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/dashboard-smoke.spec.ts`
**Automation Notes:** Covered by the Playwright smoke flow for dashboard load and salon navigation.

### Objective

Verify that the public dashboard loads with the seeded kitchens and that the operator can reach the salon surface through the real UI.

### Preconditions

- [ ] Local app starts successfully
- [ ] Seeded demo orders are loaded
- [ ] Browser session has no prior app state dependency

### Test Steps

1. Open `/`
   **Expected:** The page loads with the title "Sync board para duas cozinhas"

2. Verify both kitchen sections are visible
   **Expected:** "Kitchen 1" and "Kitchen 2" are rendered

3. Verify the metrics strip is visible
   **Expected:** "Pedidos ativos", "Parcialmente prontos", and "Prontos para servir" are visible

4. Click `Visão do salão`
   **Expected:** The browser navigates to `/salon`

5. Verify the salon screen
   **Expected:** The page shows the heading "Salão" and at least one consolidated order status

### Edge Cases

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Fresh DB startup | No prior DB file | Seeded board still loads |
| Read-only salon navigation | `/salon` | No mutation actions are exposed |

### Automation Notes

- Should become Playwright smoke coverage because it is a release-critical public flow.
