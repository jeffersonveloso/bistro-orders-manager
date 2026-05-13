## TC-INT-012: Deferred Catalog Surface Stays Blocked For All Current Areas

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/catalog/routes.test.ts` plus `npm run test:e2e` -> `e2e/access-flow.spec.ts`
**Automation Notes:** Existing route tests already cover `401/403` fail-closed catalog APIs, while Playwright confirms current areas are redirected away from `/catalog`.

### Objective

Verify that catalog administration remains deferred in this release by blocking the page and API surface for `kitchen-1`, `kitchen-2`, and `salon`.

### Preconditions

- [ ] Vitest and Playwright are runnable locally
- [ ] Catalog route tests are available
- [ ] The access flow spec is available for page-level redirect coverage

### Test Steps

1. Login as `salon` and open `/catalog`
   **Expected:** The browser redirects back to `/salon`

2. Request `GET /api/catalog/mappings` without a session
   **Expected:** The route returns `401`

3. Request `GET /api/catalog/mappings` from a `kitchen-1` session
   **Expected:** The route returns `403` before catalog payload work runs

4. Request `POST /api/catalog/mappings` from a `salon` session
   **Expected:** The route returns `403` and does not persist mappings or trigger replay work

5. Request `POST /api/catalog/provider-pull` from a `kitchen-2` session
   **Expected:** The route returns `403` and does not trigger provider pull work

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Kitchen-area catalog read | `kitchen-1` session | `403` before provider and repository reads |
| Salão page access | `/catalog` after salão login | Redirects to `/salon` |

### Traceability

- Requirement IDs: `OH-P0-05`, `OH-P0-04`
- PRD / TechSpec: deferred catalog scope, blocked catalog surface, fail-closed auth ordering
- ADRs: `ADR-003`, `ADR-005`

### Notes

- Task 09 should keep this case explicit even if the catalog routes are unchanged from task 06, because catalog deferral is part of the acceptance boundary for Operational Hardening.
