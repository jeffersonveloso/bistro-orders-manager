## TC-INT-004: Missing Mapping Fails Closed

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Pass
**Estimated Time:** 8 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- src/application/provider-sync-service.test.ts`
**Automation Notes:** Existing Vitest coverage already exercises the missing-mapping path and replay resolution behavior through the shared sync service.

### Objective

Verify that any provider item without a valid local kitchen mapping blocks the full import and opens `missing_mapping` rather than partially importing the order.

### Preconditions

- [ ] Provider sync service tests are runnable
- [ ] The fixture provider exposes an order with at least one unmapped catalog item
- [ ] SQLite test context starts clean

### Test Steps

1. Trigger sync for an order containing an unmapped provider item
   **Expected:** The sync flow does not import the order into production

2. Inspect the unresolved exceptions
   **Expected:** One `missing_mapping` exception is opened or refreshed for the external order

3. Inspect production aggregates
   **Expected:** No partial order, ticket, or item import exists for the blocked order

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Single unmapped item | One missing catalog mapping | Entire order remains out of production |
| Mixed mapped/unmapped payload | At least one valid item and one unmapped item | No partial import is allowed |

### Traceability

- Requirement IDs: `PH1-P0-03`
- PRD / TechSpec: fail-closed import behavior, mapping normalization contract
- ADRs: `ADR-006`, `ADR-008`

### Notes

- This is a release blocker because silent partial import would break kitchen trust in the board.
