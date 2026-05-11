## TC-FUNC-003: Salão Acknowledgment Keeps The Exception Operationally Visible

**Priority:** P1 (High)
**Type:** Functional
**Status:** Pass
**Estimated Time:** 8 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/salon-sync-exceptions.spec.ts`
**Automation Notes:** Existing Playwright coverage already exercises the salão acknowledgment CTA and verifies that acknowledged exceptions remain visible until later reconciliation.

### Objective

Verify that salão can acknowledge an unresolved sync exception, remove the CTA, and still keep the order visibly unresolved until the underlying sync condition is fixed.

### Preconditions

- [ ] The app is running with the seeded unresolved exception scenario
- [ ] The salão route is reachable
- [ ] The order under test exposes an acknowledgment CTA

### Test Steps

1. Open `/salon`
   **Expected:** The salão page loads and shows the target order with an unresolved sync exception

2. Inspect the initial exception card state
   **Expected:** The card shows the exception label and an acknowledgment CTA

3. Click the acknowledgment action
   **Expected:** The client sends the `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge` request and receives `200`

4. Inspect the post-acknowledgment state
   **Expected:** The CTA disappears and the card shows the acknowledged wording while the unresolved exception remains visible

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Already acknowledged exception | Same order revisited after acknowledgment | The exception remains visible without showing a second CTA |
| Salão-only operation | No kitchen mutation access | The operator can acknowledge without exposing kitchen controls |

### Traceability

- Requirement IDs: `PH1-P1-02`, `PH1-P1-03`
- PRD / TechSpec: atendimento or salão ownership, unresolved visibility, acknowledgment endpoint
- ADRs: `ADR-003`

### Notes

- This case is P1 because it follows successful exception detection, but it is still required for the Phase 1 operating model.
