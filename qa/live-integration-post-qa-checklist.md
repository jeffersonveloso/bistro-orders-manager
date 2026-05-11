# Phase 1 Live Integration Post-QA Checklist

Task 09 should use this file as the documentation gate for the Anota AI rollout. Replace each unchecked item with fresh evidence, and update `README.md`, `docs/live-integration-phase-1.md`, and `qa/verification-report.md` if runtime behavior differs from the current baseline.

## Commands To Verify

- [ ] `npm run lint`
- [ ] `npm run test:run -- --coverage`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] Record the exact server boot command and any non-default env needed for the QA environment.
- [ ] Verify the manual reconciliation command and confirm the real hostname, headers, and request body used in QA.
- [ ] Verify the targeted replay command with a real `externalOrderId`.
- [ ] Verify the webhook simulation or provider-delivered webhook evidence and document the exact payload shape that was exercised.

## Runtime Values And Ownership To Confirm

- [ ] Active `BISTRO_ORDER_SYNC_PROVIDER_MODE` in QA and pilot environments.
- [ ] Whether `BISTRO_ANOTA_AI_BASE_URL` stays at the default or needs an override.
- [ ] Who owns `BISTRO_ANOTA_AI_TOKEN` rotation.
- [ ] Who owns `BISTRO_ANOTA_WEBHOOK_SECRET` rotation and provider-side configuration.
- [ ] Who owns `BISTRO_INTERNAL_SYNC_SECRET` rotation and scheduler configuration.
- [ ] Final `BISTRO_DATABASE_PATH`, backup note, and filesystem permission assumption.
- [ ] Scheduler cadence used in QA and whether it supports the PRD arrival targets.

## Screenshots And Evidence To Capture

- [ ] Board alert banner showing at least one unresolved sync exception.
- [ ] Board ticket marker for an order with `hasOpenSyncException`.
- [ ] Order detail screen showing both kitchens plus the sync trail.
- [ ] Salão screen with an exception in `open` state and the acknowledge CTA visible.
- [ ] Salão screen after acknowledgement showing the waiting-for-reconciliation state.
- [ ] Successful imported live order visible in the kitchen board without manual relay.

## Behavior To Confirm

- [ ] Only production-valid confirmed orders are imported automatically.
- [ ] Duplicate provider delivery does not create a second production order.
- [ ] A missing catalog `externalID` or missing local kitchen mapping blocks the entire order and opens `missing_mapping`.
- [ ] Operationally relevant provider changes open `changed_externally` without rewriting kitchen data.
- [ ] Provider cancellation opens `canceled_externally` without mutating the imported production order.
- [ ] Technical fetch or normalization failures open `ingestion_failed`.
- [ ] Successful replay or reconciliation resolves `missing_mapping` and `ingestion_failed` when the underlying cause is fixed.
- [ ] `acknowledged` exceptions remain visible until reconciliation or replay resolves them.

## Documentation Reconciliation

- [ ] Update `README.md` if env names, commands, route usage, or fallback instructions differ from runtime.
- [ ] Update `docs/live-integration-phase-1.md` if scheduler behavior, webhook envelope guidance, or ownership language differs from observed QA behavior.
- [ ] Update `qa/verification-report.md` with the final evidence summary, commands, screenshots, warnings, and verdict for Phase 1.
- [ ] Record any operational caveat that remains provisional after QA instead of silently implying it is closed.
