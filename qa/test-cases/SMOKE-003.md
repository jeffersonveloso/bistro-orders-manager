## SMOKE-003: Area Login Reaches The Canonical Kitchen Surface

**Priority:** P0 (Critical)
**Type:** Functional
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/access-flow.spec.ts`, `e2e/dashboard-smoke.spec.ts`
**Automation Notes:** Existing Playwright coverage already exercises unauthenticated redirect to `/access`, valid area login, canonical redirects, and protected dashboard visibility.

### Objective

Verify that an unauthenticated operator can enter through `/access`, authenticate as `kitchen-1`, and land on the canonical protected board without seeing cross-area shortcuts.

### Preconditions

- [ ] Access runtime environment variables are configured
- [ ] Playwright Chromium is installed
- [ ] Seeded dashboard data is available in the local SQLite database

### Test Steps

1. Open `/`
   **Expected:** The browser redirects to `/access`

2. Submit valid `kitchen-1` credentials from `/access`
   **Expected:** The browser lands on `/`

3. Inspect the protected dashboard shell
   **Expected:** The page shows the board heading, both kitchen columns, and the sync alert strip

4. Revisit `/access`
   **Expected:** The existing session redirects back to `/` instead of showing the access form

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Existing kitchen session | revisit `/access` | Redirects to `/` |
| Existing salão session | revisit `/access` after salão login | Redirects to `/salon` |

### Traceability

- Requirement IDs: `OH-P0-01`, `OH-P1-03`
- PRD / TechSpec: area PIN access, canonical area home, protected board bootstrap
- ADRs: `ADR-002`, `ADR-003`, `ADR-004`

### Notes

- This smoke case is the first gate for task 09 because most deeper protected-read and protected-write checks assume the access entry flow is already working.
