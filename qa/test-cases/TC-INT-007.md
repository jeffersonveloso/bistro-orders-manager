## TC-INT-007: Access Login Contract Rejects Invalid Inputs And Normalizes Valid Redirects

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/access/session/route.test.ts`
**Automation Notes:** Existing Vitest coverage already verifies invalid area payloads, wrong PIN denial, disallowed `next` fallback, valid detail redirect normalization, and missing-config failure behavior.

### Objective

Verify that the login route accepts only valid area credentials, rejects invalid auth payloads, and returns canonical redirects that match the authenticated area policy.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Access route tests are available in `app/api/access/session/route.test.ts`
- [ ] Deterministic area PIN test configuration is present

### Test Steps

1. Submit an invalid `areaId` to `POST /api/access/session`
   **Expected:** The route returns `400` with `Invalid access payload`

2. Submit a valid area with the wrong PIN
   **Expected:** The route returns `401` with `Invalid area PIN` and does not set a session cookie

3. Submit `kitchen-1` with `next=/catalog`
   **Expected:** The route returns `200` and falls back to the canonical redirect `/`

4. Submit `kitchen-2` with `next=/orders/order_anota-101`
   **Expected:** The route returns `200` and normalizes the redirect to `/orders/order_anota-101?kitchen=kitchen-2`

5. Submit a valid body while `BISTRO_ACCESS_SESSION_SECRET` is missing
   **Expected:** The route returns `503` and does not issue a cookie

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Disallowed next target | `/catalog` | Falls back to canonical home |
| Order detail next target without `kitchen` query | `/orders/order_anota-101` | Normalizes to the authenticated kitchen |

### Traceability

- Requirement IDs: `OH-P0-01`, `OH-P1-03`
- PRD / TechSpec: area PIN access, access login route, canonical `next` behavior
- ADRs: `ADR-002`, `ADR-004`

### Notes

- Task 09 can treat this case as the deterministic contract proof for login safety before relying on browser evidence.
