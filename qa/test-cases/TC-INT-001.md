## TC-INT-001: Board And Order API Seed Contract

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Pass
**Estimated Time:** 6 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** E2E
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:e2e` -> `e2e/api-contract.spec.ts`
**Automation Notes:** Covered by Playwright request-based API verification against the public endpoints.

### Objective

Verify that the public API surfaces expose the seeded Stage 4 scenarios with consistent consolidated statuses.

### Preconditions

- [ ] Local server is running from a clean seeded database
- [ ] Public API endpoints are reachable without authentication

### Test Steps

1. Request `GET /api/board`
   **Expected:** Response status is `200`

2. Inspect the board payload
   **Expected:** The payload contains kitchens, salon summary, metrics, and `generatedAt`

3. Verify seeded salon scenarios
   **Expected:** `Pedido 102` is `Parcialmente pronto`, `Pedido 103` is `Pronto para servir`, and `Pedido 104` is `Em andamento`

4. Request `GET /api/orders/order_anota-102?kitchen=kitchen-2`
   **Expected:** Response status is `200`

5. Inspect the order detail payload
   **Expected:** The payload shows `focusTicketStatus` as `in_preparation`, `otherKitchen.statusKey` as `ready`, and `orderStatusKey` as `partially_ready`

### Edge Cases

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Stable seed contract | Clean DB startup | Payload values remain deterministic |
| Query parameter routing | `?kitchen=kitchen-2` | Focus kitchen is respected |

### Automation Notes

- Public HTTP contract coverage should run in Playwright request mode alongside UI smoke.
