## TC-FUNC-001: Order Detail Deep Link And Kitchen Mutation Flow

**Priority:** P0 (Critical)
**Type:** Functional
**Status:** Pass
**Estimated Time:** 10 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/order-detail.spec.ts`
**Automation Notes:** Covered by Playwright against the real order detail page and mutation endpoints.

### Objective

Verify that a kitchen can open an order detail deep link, see the other kitchen state, and progress its own work through real mutation actions.

### Preconditions

- [ ] Seeded order `order_anota-101` exists
- [ ] The order has items in both kitchens
- [ ] Browser is pointed to a clean seeded database state

### Test Steps

1. Open `/orders/order_anota-101?kitchen=kitchen-1`
   **Expected:** The page loads with customer name `Mesa 4`

2. Verify the focus kitchen and other kitchen sections
   **Expected:** The page shows `Kitchen 1` in focus and `Kitchen 2` in the secondary panel

3. Verify an item from the other kitchen is visible
   **Expected:** `Croissant` is visible in the other-kitchen section

4. Click `Iniciar` on a focus item
   **Expected:** The item status changes from `Novo` to `Em preparo`

5. Click `Marcar pronto` on the same item
   **Expected:** The item status changes to `Pronto`

### Edge Cases

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Direct deep link | `/orders/order_anota-101?kitchen=kitchen-1` | Correct kitchen remains in focus |
| Cross-kitchen visibility | Mixed order | Other kitchen data remains visible after mutation |

### Automation Notes

- Must become Playwright E2E because it is the main operator mutation surface.
