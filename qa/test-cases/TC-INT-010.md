## TC-INT-010: Wrong-Area Protected Writes Fail Before Repository Or Sync Side Effects

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 10 minutes
**Created:** 2026-05-13
**Last Updated:** 2026-05-13
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/orders/mutations.test.ts app/api/provider-sync-routes.test.ts`
**Automation Notes:** Existing route tests already prove wrong-area ticket and item mutations fail before repository writes, and kitchen-area acknowledge attempts fail before the sync service runs.

### Objective

Verify that protected write APIs reject cross-area actions before production data changes or sync-service acknowledgements can occur.

### Preconditions

- [ ] Vitest is runnable locally
- [ ] Mutation and provider-sync route tests are available
- [ ] Seeded production and sync-exception fixtures are available

### Test Steps

1. Send `PATCH /api/orders/order_anota-101/tickets/kitchen-2` from a `kitchen-1` session
   **Expected:** The route returns `403`, does not call `startKitchenTicket`, and leaves the target ticket state unchanged

2. Send `PATCH /api/orders/order_anota-101/items/order_anota-101__101-3` from a `kitchen-1` session
   **Expected:** The route returns `403`, does not call `updateItemStatus`, and leaves the target item row unchanged

3. Send `POST /api/orders/order_anota-101/sync-exceptions/.../acknowledge` from a kitchen session
   **Expected:** The route returns `403` and does not call the sync-service acknowledge operation

4. Send the same acknowledge request without a valid session
   **Expected:** The route returns `401` and does not call the sync-service acknowledge operation

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Cross-kitchen ticket mutation | `kitchen-1` session targeting `kitchen-2` | `403` with no repository write |
| Kitchen-area acknowledge attempt | kitchen session on salão-only endpoint | `403` with no sync-service call |

### Traceability

- Requirement IDs: `OH-P0-03`
- PRD / TechSpec: kitchen-scoped actions, salão-only acknowledgement, auth-before-mutation ordering
- ADRs: `ADR-003`, `ADR-004`

### Notes

- Task 09 should use this case as the primary proof that wrong-area writes are impossible through direct API access.
