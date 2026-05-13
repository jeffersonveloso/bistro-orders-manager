## TC-FUNC-004: Logout Clears The Session And Forces Re-entry

**Priority:** P1 (High)
**Type:** Functional
**Status:** Not Run
**Estimated Time:** 6 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/access/logout/route.test.ts app/protected-pages.test.ts`
**Automation Notes:** Existing Vitest coverage already proves deterministic cookie clearing and protected-page re-entry after the session is gone.

### Objective

Verify that logout or switch-area clears the active area session and that the next protected page request requires the operator to return through `/access`.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Logout route test and protected page tests are available
- [ ] Deterministic access cookie configuration is present

### Test Steps

1. Call `POST /api/access/logout`
   **Expected:** The route returns `204` with `Cache-Control: no-store`

2. Inspect the `Set-Cookie` header from logout
   **Expected:** The session cookie is cleared with `Max-Age=0`

3. Load a protected page after the cookie is cleared
   **Expected:** The page redirects to `/access`

4. Load another protected page with no remaining valid session
   **Expected:** The page redirects to `/access` instead of rendering protected data

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Shared-device switch area | logout then revisit `/access` | Access form is shown again |
| Direct protected revisit | request `/` or `/salon` after logout | Redirects to `/access` |

### Traceability

- Requirement IDs: `OH-P1-01`
- PRD / TechSpec: explicit logout, shared-device re-entry behavior
- ADRs: `ADR-002`

### Notes

- There is no dedicated Playwright logout flow today, so the canonical automation proof for this case stays on the existing route and protected-page test harnesses.
