## TC-INT-009: Wrong-Area And Unauthenticated Protected Reads Fail Before Protected Work

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/protected-read-routes.test.ts`
**Automation Notes:** Existing route tests already prove unauthorized and wrong-area read requests return before refresh work, while authorized requests still preserve the kitchen or salão contract.

### Objective

Verify that protected read APIs deny missing-session and wrong-area requests before `maybeRefreshRuntimeProviderSync()` or cross-kitchen detail projection work can run.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Protected read route tests are available
- [ ] Seeded repository-backed fixtures are available in the test context

### Test Steps

1. Request `GET /api/board` with no session
   **Expected:** The route returns `401` and does not trigger refresh work

2. Request `GET /api/board` with a `salon` session
   **Expected:** The route returns `403` and does not trigger refresh work

3. Request `GET /api/orders/order_anota-102?kitchen=kitchen-2` from a `kitchen-1` session
   **Expected:** The route returns `403` and does not trigger refresh work

4. Request `GET /api/orders/order_anota-102` from a `kitchen-2` session without a `kitchen` query
   **Expected:** The route returns `200` and resolves `focusKitchenId` to `kitchen-2`

5. Request `GET /api/salon` from a `salon` session
   **Expected:** The route returns the reduced salão contract without exposing kitchen board payload fields

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Missing session | no cookie | `401` before refresh |
| Wrong kitchen detail | `kitchen-1` session requesting `kitchen-2` detail | `403` before refresh |

### Traceability

- Requirement IDs: `OH-P0-02`
- PRD / TechSpec: server-enforced read authorization, canonical kitchen resolution, salão-only contract
- ADRs: `ADR-003`, `ADR-004`

### Notes

- Page-level canonical redirects remain covered by `e2e/access-flow.spec.ts` and `e2e/order-detail.spec.ts`, but this case is the deterministic API proof that protected reads fail closed.
