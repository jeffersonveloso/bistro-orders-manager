## TC-INT-008: Session Persistence, Renewal, And Expiry Stay Consistent

**Priority:** P1 (High)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 8 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- src/infrastructure/area-session.test.ts app/protected-pages.test.ts app/api/_lib/area-access-route.test.ts`
**Automation Notes:** Existing infrastructure and page-guard tests already prove renewal-window behavior, expired-session redirects, and renewed cookies only after successful authorization.

### Objective

Verify that area sessions persist through routine navigation, renew only in the configured window, and redirect expired sessions back through the access flow.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Session infrastructure and page-guard tests are available
- [ ] Deterministic session timestamps are available in test fixtures

### Test Steps

1. Revisit `/access` with an existing valid kitchen session
   **Expected:** The operator is redirected to `/`

2. Revisit `/access` with an existing valid salão session
   **Expected:** The operator is redirected to `/salon`

3. Run an authorized protected request inside the renewal window
   **Expected:** The response appends a renewed session cookie

4. Run the same type of request outside the renewal window
   **Expected:** The response does not churn the cookie unnecessarily

5. Evaluate an expired protected page session
   **Expected:** The operator is redirected to `/access?reason=expired`

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Near-expiry session | remaining lifetime inside final 25% | Cookie is renewed after auth succeeds |
| Expired session | past `expiresAt` | Redirects to `/access?reason=expired` |

### Traceability

- Requirement IDs: `OH-P1-02`, `OH-P1-03`
- PRD / TechSpec: shared-device session persistence, expiry handling, renewal-window policy
- ADRs: `ADR-002`, `ADR-004`

### Notes

- Task 09 should still capture fresh browser evidence for routine navigation, but the deterministic renewal policy proof stays on the existing Vitest harness.
