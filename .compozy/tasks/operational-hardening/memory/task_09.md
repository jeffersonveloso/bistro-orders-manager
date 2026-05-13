# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Execute the final Operational Hardening QA pass with fresh repository-gate evidence, targeted auth regression coverage, live local API/browser evidence, and final documentation reconciliation under `./qa/`.

## Important Decisions

- Used the installed `qa-execution` workflow, but fell back to manual repository-contract discovery because `scripts/discover-project-contract.py` is missing in this repo.
- Captured browser evidence through Playwright headless sessions against a live local `mock` runtime because `agent-browser` is unavailable in this environment.
- Kept scope tight to QA closure: only docs, QA artifacts, and unstable test fixtures were changed after a real verification failure exposed a harness flake.

## Learnings

- The final `--coverage` rerun surfaced a real time-coupled test flake: several auth fixtures expired once the local clock crossed `2026-05-13T16:00:00.000Z`, causing exported route and direct page-render tests to fail with `401` or `/access?reason=expired`.
- The production auth boundary itself remained correct; the fix was to move default test-fixture expiries far into the future and keep explicit expired-session cases under injected timestamps only.
- Local runtime evidence confirmed the denied `kitchen-1 -> kitchen-2` ticket/item writes leave the target ticket and item status unchanged at `new`, complementing the Vitest spy-based auth-before-side-effect proof.

## Files / Surfaces

- `qa/verification-report.md`
- `qa/issues/BUG-001.md`
- `qa/evidence/operational-hardening-runtime-summary.json`
- `qa/evidence/operational-hardening-final-rerun-summary.json`
- `qa/evidence/operational-hardening-browser-manifest.json`
- `qa/screenshots/oh-*.png`
- `README.md`
- `docs/live-integration-phase-1.md`
- `docs/anota-ai-smoke-test.md`
- `app/protected-pages.test.ts`
- `app/api/_lib/area-access-route.test.ts`
- `app/api/protected-read-routes.test.ts`
- `app/api/orders/mutations.test.ts`
- `app/api/catalog/routes.test.ts`

## Errors / Corrections

- Initial runtime screenshot capture used UI-login automation and produced stale access-screen images even when the final URL had changed; regenerated the browser evidence by minting session cookies through `POST /api/access/session` and injecting them into Playwright contexts before visiting the protected pages.
- Final verification initially failed in `app/protected-pages.test.ts` and `app/api/catalog/routes.test.ts` because the shared auth fixtures had already expired relative to the real clock; fixed the fixtures, reran the narrow repro, and then reran the full gate.

## Ready for Next Run

- Operational Hardening is ready for tracking closure once task status files are updated and the local commit is created.
- The only notable residual caveat is repository-wide branch coverage staying below `80%` even though statements, lines, and functions remain above `80%`.
