## TC-INT-005: Changed Externally Stays Visible Without Rewriting Production

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Pass
**Estimated Time:** 10 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- src/application/provider-sync-service.test.ts src/application/production-service.test.ts`
**Automation Notes:** Existing Vitest coverage already exercises production-affecting quantity or note changes plus read-model visibility of unresolved exceptions.

### Objective

Verify that an operationally relevant provider-side change after import opens `changed_externally`, leaves the kitchen board stable, and remains visible in the read models.

### Preconditions

- [ ] An imported production order already exists for the external order under test
- [ ] The provider fixture can return a changed snapshot for the same external order
- [ ] Route or read-model assertions can inspect unresolved exception metadata

### Test Steps

1. Import a confirmed-ready external order into production
   **Expected:** The order is persisted with kitchen tickets and no unresolved exception

2. Re-sync the same external order after a production-affecting change such as quantity or note divergence
   **Expected:** The sync flow opens or refreshes `changed_externally`

3. Inspect production items and ticket state after the change
   **Expected:** Existing kitchen entities remain unchanged

4. Inspect board, detail, or salão read-model metadata
   **Expected:** The unresolved exception marker and sync-trail visibility remain present

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Quantity change | Same items, changed quantity | `changed_externally` is opened without board rewrite |
| Modifier or note change | Production-affecting modifier or note delta | The exception is opened and the board remains stable |

### Traceability

- Requirement IDs: `PH1-P0-04`, `PH1-P1-03`
- PRD / TechSpec: relevant change filtering, board stability, sync exception visibility
- ADRs: `ADR-002`, `ADR-003`

### Notes

- This case validates the Phase 1 contract that the kitchen board is operator-owned after import.
