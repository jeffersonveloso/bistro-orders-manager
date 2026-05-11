## TC-INT-002: Confirmed Webhook Intake Imports Exactly Once

**Priority:** P0 (Critical)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 10 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts`
**Automation Notes:** Existing Vitest coverage already exercises successful webhook import plus duplicate delivery suppression through the shared sync service and route handlers.

### Objective

Verify that a confirmed-ready external order imports into production through the webhook path and that a duplicate provider delivery does not create a second production order.

### Preconditions

- [ ] Sync route and service tests are runnable through `vitest`
- [ ] The provider fixture exposes a confirmed-ready snapshot
- [ ] SQLite test context starts from a clean state

### Test Steps

1. Submit a valid confirmed-order webhook event with a unique delivery key
   **Expected:** The sync flow returns a terminal success outcome and imports one production order

2. Inspect sync persistence after the first import
   **Expected:** Exactly one `provider_event`, one `sync_run`, and one `provider_order` are persisted for the external order

3. Re-submit the same delivery key and order payload
   **Expected:** The sync flow reports `duplicate_ignored`

4. Inspect production and sync persistence after the duplicate delivery
   **Expected:** No second production order or duplicate sync records are created

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Duplicate provider retry | Same `deliveryKey` and `externalOrderId` | The duplicate is ignored without side effects |
| Confirmed-ready canonical snapshot | `lifecycle=confirmed_ready` | The order enters production on the first pass |

### Traceability

- Requirement IDs: `PH1-P0-01`, `PH1-P0-02`
- PRD / TechSpec: confirmed-order intake, duplicate protection, webhook-first path
- ADRs: `ADR-001`, `ADR-004`

### Notes

- Task 09 should still capture runtime webhook evidence even though the code-level safety net already exists.
