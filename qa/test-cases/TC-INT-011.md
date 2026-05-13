## TC-INT-011: Guard Helpers Deny Access Before Protected Callback, Refresh, Or Catalog Work Starts

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/_lib/area-access-route.test.ts app/api/protected-read-routes.test.ts app/api/catalog/routes.test.ts`
**Automation Notes:** Existing helper and route suites already assert callback counts, refresh spies, provider calls, and repository calls remain untouched when access is denied.

### Objective

Verify the cross-cutting auth-before-side-effect guarantee: guard helpers and protected handlers must deny access before any protected callback, runtime refresh, provider lookup, or catalog persistence work begins.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Guard-helper, protected-read, and catalog route tests are available
- [ ] Test doubles are available for callback, refresh, provider, and repository work

### Test Steps

1. Run `withKitchenArea()` without a session
   **Expected:** The helper returns `401` and the protected callback does not execute

2. Run `withKitchenArea()` with a `salon` session
   **Expected:** The helper returns `403` and the protected callback does not execute

3. Request `GET /api/board` without a session
   **Expected:** The route returns `401` and does not call `maybeRefreshRuntimeProviderSync()`

4. Request `GET /api/catalog/mappings` without a session
   **Expected:** The route returns `401` and does not call catalog-provider or repository read work

5. Request `POST /api/catalog/mappings` from a `salon` session
   **Expected:** The route returns `403` and does not persist mappings or trigger provider-assisted replay work

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Missing session | no cookie | Protected callback count stays at zero |
| Wrong area | `salon` on kitchen-only or catalog write route | `403` before provider or repository work |

### Traceability

- Requirement IDs: `OH-P0-04`
- PRD / TechSpec: auth-before-side-effect ordering, protected callback and refresh denial
- ADRs: `ADR-003`, `ADR-004`, `ADR-005`

### Notes

- This case is the release-critical guard-order proof because it validates the failure mode the user explicitly called out in the TechSpec.
