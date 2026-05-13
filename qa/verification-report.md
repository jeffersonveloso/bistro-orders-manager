VERIFICATION REPORT
-------------------
Claim: Operational Hardening passes the repository verification gate, the planned auth regression matrix, and the final local runtime QA pass, with documentation updated to match the verified catalog-deferral behavior.
Command: `npm run lint` -> `npm run test:run -- --coverage` -> `npm run build` -> `npm run test:e2e`
Executed: 2026-05-13 final rerun after fixing a time-coupled auth test fixture; final API rerun recorded at `2026-05-13T16:04:33.546Z`
Exit code: 0
Output summary: `npm run lint` passed. `npm run test:run -- --coverage` passed with `30` files, `211` tests, and coverage `Statements 82.48% / Branches 69.76% / Functions 81.7% / Lines 82.34%`. `npm run build` passed. `npm run test:e2e` passed with `13` Playwright tests covering access, redirects, protected APIs, order detail, and salão acknowledgement flows.
Warnings:
- Node emitted the benign `NO_COLOR` / `FORCE_COLOR` warning during lint, Vitest, build, Playwright, and local evidence scripts.
- The `qa-execution` workflow was applied with manual contract discovery because the referenced repository helper `scripts/discover-project-contract.py` is missing in this checkout.
- The `agent-browser` CLI was unavailable, so browser screenshots were captured with Playwright headless sessions against a live local server instead.
- Global branch coverage remains `69.76%`; statements, lines, and functions remain above `80%`, but the repo still has older low-coverage client/UI surfaces outside the protected-auth regression slice.
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
- `SMOKE-003` area access and canonical kitchen landing: existing-e2e
- `TC-INT-007` access login contract: existing-integration
- `TC-FUNC-004` logout and forced re-entry: existing-integration plus runtime API proof
- `TC-INT-008` session persistence, renewal, and expiry behavior: existing-integration
- `TC-INT-009` wrong-area protected reads denied before refresh: existing-integration
- `TC-INT-010` wrong-area protected writes denied before mutation or acknowledge side effects: existing-integration
- `TC-INT-011` guard helpers and protected handlers deny access before callback, refresh, and catalog work: existing-integration
- `TC-INT-012` deferred catalog page and APIs stay blocked for all current operational areas: existing-integration plus existing-e2e
- `TC-UI-001` salão status clarity: manual-only
Specs added or updated during this QA closure:
- `app/protected-pages.test.ts`: default auth fixtures now use a far-future expiry so direct page-render tests do not depend on wall-clock time
- `app/api/_lib/area-access-route.test.ts`: default session fixture expiry no longer flakes when exported helpers use the real clock
- `app/api/protected-read-routes.test.ts`: default session fixture expiry stabilized for long-lived QA sessions
- `app/api/orders/mutations.test.ts`: default session fixture expiry stabilized for long-lived QA sessions
- `app/api/catalog/routes.test.ts`: exported catalog route tests no longer fail once the local clock passes the original fixture expiry
Commands executed:
- `npm run test:run -- app/api/access/session/route.test.ts app/api/access/logout/route.test.ts app/api/_lib/area-access-route.test.ts app/api/protected-read-routes.test.ts app/api/orders/mutations.test.ts app/api/provider-sync-routes.test.ts app/api/catalog/routes.test.ts app/protected-pages.test.ts src/infrastructure/area-session.test.ts` | Exit code: `0` | Summary: targeted Operational Hardening regression suites passed with `9` files and `80` tests
- `npm run test:run -- app/api/catalog/routes.test.ts app/protected-pages.test.ts` | Exit code: `0` | Summary: narrow repro passed with `2` files and `36` tests after fixing the time-coupled auth fixtures
- `npm run test:run -- --coverage` | Exit code: `0` | Summary: `30` files and `211` tests passed on the final state
- `npm run test:e2e` | Exit code: `0` | Summary: `13` Playwright tests passed on the final state
Manual-only or blocked:
- Repository contract discovery script: blocked because `scripts/discover-project-contract.py` is absent; repository contract was resolved manually from `package.json`, configs, and existing QA artifacts
- Browser CLI workflow: blocked because `agent-browser` is not installed in this environment; equivalent screenshots were captured via Playwright against the live local server
- `TC-UI-001`: manual-only because the pass condition is qualitative status-language clarity rather than a binary DOM contract

MANUAL API / RUNTIME EVIDENCE
-----------------------------
QA output path: repository root `./qa/`
App runtime:
- URL: `http://127.0.0.1:3100`
- Provider mode: `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock`
- Database path: `data/bistro-production.qa-hardening.sqlite`
- Boot command: `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock BISTRO_DATABASE_PATH=data/bistro-production.qa-hardening.sqlite BISTRO_ACCESS_SESSION_SECRET=qa-hardening-session-secret BISTRO_ACCESS_PIN_KITCHEN_1=1111 BISTRO_ACCESS_PIN_KITCHEN_2=2222 BISTRO_ACCESS_PIN_SALON=3333 npm run start -- --hostname 127.0.0.1 --port 3100`

Scenarios executed through public routes:
- `unauthorized_board_read`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`, `qa/evidence/operational-hardening-final-rerun-summary.json`
  - Result: PASS
  - Notes: `GET /api/board` without session returned `401`
- `invalid_pin_denied`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`
  - Result: PASS
  - Notes: `POST /api/access/session` with the wrong PIN returned `401` and no session was used afterward
- `canonical_page_redirects`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`
  - Result: PASS
  - Notes: `GET /access` with a kitchen session redirected to `/`; `GET /salon` with a kitchen session redirected to `/`; `GET /catalog` with a salão session redirected to `/salon`
- `protected_read_contract`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`, `qa/evidence/operational-hardening-final-rerun-summary.json`
  - Result: PASS
  - Notes: wrong-area board read returned `403`; cross-kitchen order detail returned `403`; kitchen detail without query normalized to `focusKitchenId = kitchen-1`
- `protected_write_contract`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`
  - Result: PASS
  - Notes: wrong-area ticket and item mutations returned `403`; kitchen-side acknowledge returned `403`; the denied item and ticket remained `new` before and after the rejected requests
- `deferred_catalog_contract`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`, `qa/evidence/operational-hardening-final-rerun-summary.json`
  - Result: PASS
  - Notes: catalog APIs returned `401` without session and `403` for current operational areas; `/catalog` redirected authenticated salão back to `/salon`
- `logout_and_reentry`
  - Evidence: `qa/evidence/operational-hardening-runtime-summary.json`
  - Result: PASS
  - Notes: logout returned `204` and the same cookie jar then received `401` on `GET /api/salon`

Auth-before-side-effect proof:
- Deterministic route-level proof comes from the targeted Vitest suites, especially `app/api/_lib/area-access-route.test.ts`, `app/api/protected-read-routes.test.ts`, `app/api/orders/mutations.test.ts`, `app/api/provider-sync-routes.test.ts`, and `app/api/catalog/routes.test.ts`
- Runtime mutation proof comes from `qa/evidence/operational-hardening-runtime-summary.json`, which shows the denied `kitchen-1 -> kitchen-2` item and ticket writes left the target kitchen state unchanged

BROWSER EVIDENCE
----------------
Dev server: `http://127.0.0.1:3100` from the isolated `mock` runtime above
Flows tested: 5
Flow details:
- `access-tablet`: `/access` -> `/access` | Verdict: PASS
  - Evidence: `qa/screenshots/oh-access-tablet.png`
- `board-kitchen-1-desktop`: `/` -> `/` | Verdict: PASS
  - Evidence: `qa/screenshots/oh-board-kitchen-1-desktop.png`
- `order-detail-kitchen-1-desktop`: `/orders/order_anota-101` -> `/orders/order_anota-101?kitchen=kitchen-1` | Verdict: PASS
  - Evidence: `qa/screenshots/oh-order-detail-kitchen-1-desktop.png`
- `salon-desktop`: `/salon` -> `/salon` | Verdict: PASS
  - Evidence: `qa/screenshots/oh-salon-desktop.png`
- `catalog-redirect-salon-desktop`: `/catalog` -> `/salon` | Verdict: PASS
  - Evidence: `qa/screenshots/oh-catalog-redirect-salon-desktop.png`
Viewports tested: `768x1024`, `1440x1100`
Authentication: area session cookies were minted through `POST /api/access/session`; the final screenshots were regenerated with injected session cookies after the first UI-login capture produced stale access-screen images
Blocked flows:
- `agent-browser` CLI unavailable in this environment; Playwright headless screenshots were used instead

TEST CASE COVERAGE
------------------
Planning artifacts consumed:
- `qa/test-plans/operational-hardening-test-plan.md`
- `qa/test-plans/operational-hardening-regression.md`
- `qa/test-plans/operational-hardening-qa-report-fallback.md`
Operational Hardening cases executed: 9
Results:
- `SMOKE-003`: PASS | Bug: none
- `TC-INT-007`: PASS | Bug: none
- `TC-FUNC-004`: PASS | Bug: none
- `TC-INT-008`: PASS | Bug: none
- `TC-INT-009`: PASS | Bug: none
- `TC-INT-010`: PASS | Bug: none
- `TC-INT-011`: PASS | Bug: `BUG-001` fixed during the final rerun
- `TC-INT-012`: PASS | Bug: `BUG-001` fixed during the final rerun
- `TC-UI-001`: PASS | Bug: none
Not executed:
- none inside the Operational Hardening package
- other `qa/test-cases/*.md` files belong to earlier or parallel workstreams and were out of scope for task 09

DOCUMENTATION RECONCILIATION
----------------------------
Updated files:
- `README.md`
- `docs/live-integration-phase-1.md`
- `docs/anota-ai-smoke-test.md`
Reason:
- Local runtime verification proved that `/catalog` redirects current operational areas and `/api/catalog/*` returns `401/403` for the same area matrix, so the docs were corrected to stop instructing kitchen or salão users to perform live mapping work through those blocked surfaces

ISSUES FILED
------------
Total: 1
By severity:
- Critical: 0
- High: 0
- Medium: 1
- Low: 0
Details:
- `BUG-001`: auth test fixtures expired based on wall clock time | Severity: Medium | Priority: P1 | Status: Fixed

BLOCKERS AND CAVEATS
-------------------
- No local auth, environment, or browser blocker remained for the Operational Hardening QA pass.
- Branch coverage remains below `80%` at the repository level (`69.76%`), but statements, lines, and functions remain above `80%`. The current deficit is concentrated in older client/UI surfaces outside the protected-auth regression slice validated in this task.
