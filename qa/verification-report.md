VERIFICATION REPORT
-------------------
Claim: Phase 1 real-integration surfaces pass the repository verification gate and local end-to-end QA against the real `anota_ai` adapter, with documentation updated to match the verified runtime bootstrap behavior.
Command: `npm run lint` -> `npm run test:run -- --coverage` -> `npm run build` -> `npm run test:e2e`
Executed: 2026-05-11 final rerun, with manual HTTP and browser evidence refreshed after the live-bootstrap fix
Exit code: 0
Output summary: `npm run lint` passed. `npm run test:run -- --coverage` passed with `15` files, `85` tests, and coverage `Statements 92.98% / Branches 82.15% / Functions 95.23% / Lines 92.93%`. `npm run build` passed. `npm run test:e2e` passed with `5` Playwright tests.
Warnings:
- Node emitted the benign `NO_COLOR` / `FORCE_COLOR` warning during lint, build, Vitest, Playwright, and local helper scripts.
- The `qa-execution` skill was followed manually because the referenced repository helper `scripts/discover-project-contract.py` is not present in this checkout.
Errors: none in the final state
Verdict: PASS

AUTOMATED COVERAGE
------------------
Support detected: yes
Harnesses:
- `vitest`
- `playwright`
Canonical commands:
- `npm run test:run -- --coverage`
- `npm run test:e2e`
Required flows:
- repository verification gate: PASS
- webhook intake and duplicate suppression: existing integration coverage + manual HTTP evidence
- reconciliation replay and recovery: existing integration coverage + manual HTTP evidence
- missing mapping fail-closed behavior: existing integration coverage + manual HTTP evidence
- `changed_externally` without production rewrite: existing integration coverage + manual HTTP evidence
- `canceled_externally` without production rewrite: existing integration coverage + manual HTTP evidence
- salão acknowledgment without clearing unresolved visibility: existing E2E coverage + manual browser evidence
Specs added or updated during task 09:
- `src/infrastructure/sqlite.ts`: runtime bootstrap now skips demo orders and demo sync exceptions on fresh `anota_ai` databases
- `src/infrastructure/sqlite.sync.test.ts`: regression coverage for clean live bootstrap
Commands executed:
- `npm run test:run -- src/infrastructure/sqlite.sync.test.ts src/application/live-integration-docs.test.ts` | Exit code: `0` | Summary: bootstrap regression and doc alignment passed after the QA fix
- `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts src/application/production-service.test.ts` | Exit code: `0` | Summary: `3` files and `29` Phase 1 route/service/read-model tests passed on the final code state
Manual-only or blocked:
- Real Anota credential ownership, provider-side webhook configuration, and scheduler cadence remain blocked because no live pilot environment or owners were available in this repository session.

MANUAL API / RUNTIME EVIDENCE
-----------------------------
QA output path: repository root `./qa/`
App runtime:
- URL: `http://127.0.0.1:3100`
- Provider mode: `BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai`
- Provider base URL override: `http://127.0.0.1:4010/partnerauth`
- Database path: `data/bistro-production.qa.sqlite`
- Provider auth header used by the adapter: `Authorization: qa-anota-token`
Execution note:
- The manual Phase 1 run used a local fake provider to drive the real `anota_ai` adapter over HTTP. This validated the app boundary without mocking the application service itself.

Scenarios executed through public routes:
- `live_bootstrap`
  - Evidence: `qa/evidence/board-baseline.json`, `qa/evidence/phase1-manual-summary.json`
  - Result: PASS
  - Notes: a fresh `anota_ai` database now starts with `0` orders and `0` unresolved sync exceptions.
- `webhook_duplicate`
  - Evidence: `qa/evidence/webhook-import-201.json`, `qa/evidence/webhook-import-201-duplicate.json`, `qa/evidence/detail-import-201.json`
  - Result: PASS
  - Notes: first webhook imported `order_qa-import-201`; replay of the same `deliveryKey` returned `duplicate_ignored`.
- `missing_mapping_replay`
  - Evidence: `qa/evidence/webhook-missing-202.json`, `qa/evidence/board-after-missing-202.json`, `qa/evidence/reconcile-missing-202.json`, `qa/evidence/detail-missing-202.json`
  - Result: PASS
  - Notes: import failed closed with `missing_mapping`, then replay imported the order and resolved the exception after the local kitchen mapping was inserted.
- `ingestion_failed_replay`
  - Evidence: `qa/evidence/webhook-ingestion-fail-203.json`, `qa/evidence/board-after-ingestion-fail-203.json`, `qa/evidence/reconcile-ingestion-fail-203.json`, `qa/evidence/detail-ingestion-recovered-203.json`
  - Result: PASS
  - Notes: webhook returned HTTP `500` and opened `ingestion_failed` until the provider exposed a canonical snapshot; targeted replay then imported and resolved it.
- `changed_externally`
  - Evidence: `qa/evidence/detail-before-change-204.json`, `qa/evidence/reconcile-change-204.json`, `qa/evidence/detail-after-change-204.json`
  - Result: PASS
  - Notes: provider quantity changed after import, but the production quantity remained `1` and the order was marked `changed_externally`.
- `canceled_externally`
  - Evidence: `qa/evidence/reconcile-cancel-205.json`, `qa/evidence/detail-after-cancel-205.json`
  - Result: PASS
  - Notes: provider cancellation opened `canceled_externally` and preserved the imported production items.
- `reconciliation_list`
  - Evidence: `qa/evidence/reconcile-list-206.json`, `qa/evidence/detail-reconcile-206.json`
  - Result: PASS
  - Notes: list-based reconciliation with `updatedSince` and `limit` imported a confirmed-ready order through the scheduler-facing route.
- `salon_acknowledgement`
  - Evidence: `qa/evidence/acknowledge-change-204.json`, `qa/evidence/detail-after-acknowledge-204.json`
  - Result: PASS
  - Notes: acknowledgment moved the exception to `acknowledged` while keeping it operationally visible in the sync trail.

BROWSER EVIDENCE
----------------
Dev server URL: `http://127.0.0.1:3100`
Flows tested count: 4
Per-flow evidence:
- Board alert banner and unresolved exception summary | Entry URL: `/` | Final URL: `/` | Verdict: PASS | Screenshot: `qa/screenshots/board-alert-banner.png`
- Board ticket marker and successful imported order card | Entry URL: `/` | Final URL: `/` | Verdict: PASS | Screenshots: `qa/screenshots/board-ticket-marker-qa-salon-207.png`, `qa/screenshots/board-imported-order-qa-import-201.png`
- Order detail sync trail with both kitchens visible | Entry URL: `/orders/order_qa-salon-207?kitchen=kitchen-1` | Final URL: same | Verdict: PASS | Screenshot: `qa/screenshots/order-detail-sync-trail-qa-salon-207.png`
- Salão acknowledgment before and after CTA | Entry URL: `/salon` | Final URL: `/salon` | Verdict: PASS | Screenshots: `qa/screenshots/salon-open-qa-salon-207.png`, `qa/screenshots/salon-acknowledged-qa-salon-207.png`
Viewports tested: `1440x1100`
Authentication method: route-level shared secrets for sync entry points; salão acknowledgment requires no provider secret
Blocked flows: none for the local QA environment
Manifest: `qa/evidence/browser-screenshot-manifest.json`

TEST CASE COVERAGE
------------------
Checklist source: `qa/live-integration-post-qa-checklist.md`
Planning artifacts consumed:
- `qa/test-plans/real-integration-test-plan.md`
- `qa/test-plans/real-integration-regression.md`
- `qa/test-plans/real-integration-qa-report-fallback.md`
Executed Phase 1 cases:
- `SMOKE-002`: PASS
- `TC-INT-002`: PASS
- `TC-INT-003`: PASS
- `TC-INT-004`: PASS
- `TC-INT-005`: PASS
- `TC-INT-006`: PASS
- `TC-FUNC-003`: PASS
Repository-wide regression baseline also executed:
- `npm run test:run -- --coverage`
- `npm run test:e2e`

DOCUMENTATION RECONCILIATION
----------------------------
Updated files:
- `README.md`
- `docs/live-integration-phase-1.md`
- `qa/live-integration-post-qa-checklist.md`
Reason:
- QA exposed that fresh `anota_ai` databases must boot without demo orders and demo sync exceptions. The runtime was corrected and the docs now distinguish seeded `mock` startup from clean `anota_ai` startup.

ISSUES FILED
------------
Total open issues: 0
Resolved during task 09:
- Live-mode bootstrap pollution on fresh `anota_ai` databases was discovered during QA, fixed in `src/infrastructure/sqlite.ts`, covered by `src/infrastructure/sqlite.sync.test.ts`, and reverified before this report was written.

BLOCKERS AND CAVEATS
--------------------
- Local QA proved the real adapter boundary with a fake provider, but no live Anota tenant, credential owner, webhook console access, or scheduler service was available in this environment.
- Because those live prerequisites remain unavailable, ownership for `BISTRO_ANOTA_AI_TOKEN`, `BISTRO_ANOTA_WEBHOOK_SECRET`, `BISTRO_INTERNAL_SYNC_SECRET`, and the production scheduler cadence is still provisional.
- These blocked pilot-only confirmations remain tracked in `qa/live-integration-post-qa-checklist.md`.
