## TC-FUNC-002: Single-Kitchen Order Regression

**Priority:** P1 (High)
**Type:** Functional
**Status:** Pass
**Estimated Time:** 7 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/order-detail.spec.ts`
**Automation Notes:** Covered by the single-kitchen branch in the Playwright order detail suite.

### Objective

Verify that a single-kitchen order does not show false dependency on another kitchen and remains operable in the detail page.

### Preconditions

- [ ] Seeded order `order_anota-105` exists
- [ ] The order contains only `Kitchen 1` items

### Test Steps

1. Open `/orders/order_anota-105?kitchen=kitchen-1`
   **Expected:** The page loads successfully

2. Inspect the secondary panel
   **Expected:** The page displays `Sem outra cozinha`

3. Verify the empty dependency message
   **Expected:** The text `Este pedido pertence somente a esta cozinha.` is visible

4. Start the kitchen or an item action
   **Expected:** The action completes without requiring another kitchen state

### Edge Cases

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Single-ticket order | Only `kitchen-1` items | No cross-kitchen panel content is required |
| Direct route access | Order deep link | Page still resolves correctly |

### Automation Notes

- Should share the same Playwright order-detail suite because it validates the seeded Stage 4 single-kitchen scenario.
