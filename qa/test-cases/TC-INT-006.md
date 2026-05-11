## TC-INT-006: Provider Cancellation Does Not Rewrite Kitchen Data

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Pass
**Estimated Time:** 9 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- src/application/provider-sync-service.test.ts src/application/production-service.test.ts`
**Automation Notes:** Existing Vitest coverage already exercises imported-order cancellation plus unresolved exception visibility in the read models.

### Objective

Verify that a provider-side cancellation after import opens `canceled_externally` while preserving the existing production order, items, and kitchen statuses.

### Preconditions

- [ ] An imported production order exists for the provider order under test
- [ ] The provider fixture can return a canceled lifecycle for the same external order
- [ ] Read-model assertions can inspect unresolved exception metadata

### Test Steps

1. Import a confirmed-ready external order into production
   **Expected:** The order is present in the board without unresolved cancellation state

2. Re-sync the same order with a canceled provider lifecycle
   **Expected:** The sync flow opens or refreshes `canceled_externally`

3. Inspect the imported production order after cancellation handling
   **Expected:** Kitchen items, ticket statuses, and the production aggregate remain unchanged

4. Inspect unresolved exception visibility in the read models
   **Expected:** The order remains decorated with the cancellation marker until later resolution

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Imported order canceled upstream | `lifecycle=canceled` after import | A `canceled_externally` exception is opened |
| Subsequent valid baseline | Later confirmed-ready snapshot | Resolution can occur only through a later successful sync |

### Traceability

- Requirement IDs: `PH1-P0-05`, `PH1-P1-03`
- PRD / TechSpec: external cancellation handling, unresolved visibility, board stability
- ADRs: `ADR-002`, `ADR-003`

### Notes

- This case is distinct from `changed_externally` because the provider lifecycle changes while the kitchen aggregate still must not be rewritten automatically.
