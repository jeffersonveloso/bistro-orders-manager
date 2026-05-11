# Phase 1 Live Integration Post-QA Checklist

Task 09 used this file as the documentation gate for the Anota AI rollout. Evidence below reflects the final rerun after the live-bootstrap fix that removed demo orders and demo sync exceptions from fresh `anota_ai` databases.

## Commands To Verify

- [x] `npm run lint`
  - Verified on 2026-05-11 during the final rerun. Exit code `0`.
- [x] `npm run test:run -- --coverage`
  - Verified on 2026-05-11 during the final rerun. Exit code `0`. Coverage: Statements `92.98%`, Branches `82.15%`, Functions `95.23%`, Lines `92.93%`.
- [x] `npm run build`
  - Verified on 2026-05-11 during the final rerun. Exit code `0`.
- [x] `npm run test:e2e`
  - Verified on 2026-05-11 during the final rerun. Exit code `0`. Playwright passed `5` tests.
- [x] Record the exact server boot command and any non-default env needed for the QA environment.
  - Verified with:
    `BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai BISTRO_ANOTA_AI_TOKEN=qa-anota-token BISTRO_ANOTA_AI_BASE_URL=http://127.0.0.1:4010/partnerauth BISTRO_ANOTA_WEBHOOK_SECRET=qa-webhook-secret BISTRO_INTERNAL_SYNC_SECRET=qa-internal-secret BISTRO_DATABASE_PATH=data/bistro-production.qa.sqlite npm run start -- --hostname 127.0.0.1 --port 3100`
- [x] Verify the manual reconciliation command and confirm the real hostname, headers, and request body used in QA.
  - Verified locally against `http://127.0.0.1:3100/api/internal/sync/anota-ai` with header `x-bistro-internal-sync-secret: qa-internal-secret`.
  - Verified request bodies:
    - `{"externalOrderId":"qa-missing-202"}`
    - `{"externalOrderId":"qa-fetch-203"}`
    - `{"externalOrderId":"qa-change-204"}`
    - `{"externalOrderId":"qa-cancel-205"}`
    - `{"updatedSince":"2000-01-01T00:00:00.000Z","limit":25}`
- [x] Verify the targeted replay command with a real `externalOrderId`.
  - Verified with `qa-missing-202`, `qa-fetch-203`, `qa-change-204`, and `qa-cancel-205`.
- [x] Verify the webhook simulation or provider-delivered webhook evidence and document the exact payload shape that was exercised.
  - Verified locally against `http://127.0.0.1:3100/api/integrations/anota-ai/webhook` with header `x-bistro-anota-webhook-secret: qa-webhook-secret`.
  - Verified payload shape:
    `{"deliveryKey":"qa-delivery-201","eventType":"order.confirmed","externalOrderId":"qa-import-201"}`

## Runtime Values And Ownership To Confirm

- [x] Active `BISTRO_ORDER_SYNC_PROVIDER_MODE` in QA and pilot environments.
  - QA execution used `anota_ai`.
- [x] Whether `BISTRO_ANOTA_AI_BASE_URL` stays at the default or needs an override.
  - Local QA used the override `http://127.0.0.1:4010/partnerauth` to drive a fake provider through the real adapter. Production default remains unverified in this environment.
- [ ] Who owns `BISTRO_ANOTA_AI_TOKEN` rotation.
  - Blocked: no live provider owner or pilot credentials were available in this repository environment.
- [ ] Who owns `BISTRO_ANOTA_WEBHOOK_SECRET` rotation and provider-side configuration.
  - Blocked: no live provider-side configuration path was available in this repository environment.
- [ ] Who owns `BISTRO_INTERNAL_SYNC_SECRET` rotation and scheduler configuration.
  - Blocked: no pilot scheduler owner or deployment target was available in this repository environment.
- [x] Final `BISTRO_DATABASE_PATH`, backup note, and filesystem permission assumption.
  - Local QA used `data/bistro-production.qa.sqlite`.
  - Assumption: the runtime can create sibling `-wal` and `-shm` files in the same directory.
- [ ] Scheduler cadence used in QA and whether it supports the PRD arrival targets.
  - Blocked: task 09 verified the reconciliation HTTP surface manually, but no real scheduler service or cadence owner was available.

## Screenshots And Evidence To Capture

- [x] Board alert banner showing at least one unresolved sync exception.
  - `qa/screenshots/board-alert-banner.png`
- [x] Board ticket marker for an order with `hasOpenSyncException`.
  - `qa/screenshots/board-ticket-marker-qa-salon-207.png`
- [x] Order detail screen showing both kitchens plus the sync trail.
  - `qa/screenshots/order-detail-sync-trail-qa-salon-207.png`
- [x] Salão screen with an exception in `open` state and the acknowledge CTA visible.
  - `qa/screenshots/salon-open-qa-salon-207.png`
- [x] Salão screen after acknowledgement showing the waiting-for-reconciliation state.
  - `qa/screenshots/salon-acknowledged-qa-salon-207.png`
- [x] Successful imported live order visible in the kitchen board without manual relay.
  - `qa/screenshots/board-imported-order-qa-import-201.png`

## Behavior To Confirm

- [x] Only production-valid confirmed orders are imported automatically.
  - Verified by webhook import `qa-import-201` and reconciliation import `qa-reconcile-206`.
- [x] Duplicate provider delivery does not create a second production order.
  - Verified by duplicate replay of `qa-delivery-201` returning `duplicate_ignored`.
- [x] A missing catalog `externalID` or missing local kitchen mapping blocks the entire order and opens `missing_mapping`.
  - Verified by `qa-missing-202`, followed by successful replay after inserting the local mapping.
- [x] Operationally relevant provider changes open `changed_externally` without rewriting kitchen data.
  - Verified by `qa-change-204` and `qa-salon-207`. The imported quantity stayed `1` after the provider changed it to `3` or `2`.
- [x] Provider cancellation opens `canceled_externally` without mutating the imported production order.
  - Verified by `qa-cancel-205`.
- [x] Technical fetch or normalization failures open `ingestion_failed`.
  - Verified by `qa-fetch-203` returning HTTP `500` until the provider snapshot became available.
- [x] Successful replay or reconciliation resolves `missing_mapping` and `ingestion_failed` when the underlying cause is fixed.
  - Verified by replay of `qa-missing-202` and `qa-fetch-203`.
- [x] `acknowledged` exceptions remain visible until reconciliation or replay resolves them.
  - Verified by `qa-change-204` in API evidence and `qa-salon-207` in UI evidence.

## Documentation Reconciliation

- [x] Update `README.md` if env names, commands, route usage, or fallback instructions differ from runtime.
  - Updated to distinguish `mock` startup seeding from clean `anota_ai` startup.
- [x] Update `docs/live-integration-phase-1.md` if scheduler behavior, webhook envelope guidance, or ownership language differs from observed QA behavior.
  - Updated to document the clean-board bootstrap in `anota_ai` mode.
- [x] Update `qa/verification-report.md` with the final evidence summary, commands, screenshots, warnings, and verdict for Phase 1.
  - Refreshed in task 09.
- [x] Record any operational caveat that remains provisional after QA instead of silently implying it is closed.
  - Live credential ownership, webhook-side configuration, and scheduler cadence remain explicitly blocked pending pilot environment access.
