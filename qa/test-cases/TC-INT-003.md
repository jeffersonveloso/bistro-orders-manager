## TC-INT-003: Reconciliation Replay Resolves Recoverable Failures

**Priority:** P1 (High)
**Type:** Integration
**Status:** Not Run
**Estimated Time:** 12 minutes
**Created:** 2026-05-11
**Last Updated:** 2026-05-11
**Automation Target:** Integration
**Automation Status:** Existing
**Automation Command/Spec:** `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts`
**Automation Notes:** Existing Vitest coverage already exercises targeted replay after canonical-fetch failure and successful replay after a missing mapping fix.

### Objective

Verify that reconciliation or targeted replay closes recoverable exception paths after the underlying issue is fixed, instead of leaving `ingestion_failed` or `missing_mapping` permanently unresolved.

### Preconditions

- [ ] Reconciliation route and provider sync service tests are runnable
- [ ] A failing or blocked external order scenario exists in the test fixture
- [ ] The root cause can be corrected between the failed pass and the replay pass

### Test Steps

1. Trigger a sync failure or blocked import for a known external order
   **Expected:** The order remains out of the board or unresolved, and an exception is opened for the failure state

2. Correct the underlying cause
   **Expected:** The provider snapshot or mapping state becomes production-valid

3. Trigger targeted reconciliation or replay for the same `externalOrderId`
   **Expected:** The sync flow completes successfully and imports or refreshes the order as allowed by Phase 1 rules

4. Inspect the unresolved exception set after replay
   **Expected:** The previously recoverable `ingestion_failed` or `missing_mapping` exception is resolved

### Edge Cases & Variations

| Variation | Input | Expected Result |
|-----------|-------|-----------------|
| Canonical fetch recovers | Upstream returns a valid snapshot on replay | `ingestion_failed` is resolved |
| Mapping corrected | Missing catalog mapping is added before replay | `missing_mapping` is resolved and the order imports |

### Traceability

- Requirement IDs: `PH1-P1-01`
- PRD / TechSpec: scheduled reconciliation safety net, replay recovery, exception lifecycle
- ADRs: `ADR-004`, `ADR-006`

### Notes

- Task 09 should record the real replay command, request body, and environment host in `qa/verification-report.md`.
