# Task Memory: task_09.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Execute the final Phase 1 QA pass, refresh `qa/verification-report.md`, and close task 09 with fresh automated plus manual evidence under `./qa/`.

## Important Decisions
- Follow the `qa-execution` workflow manually because the skill is available only as guidance in this environment and the referenced discovery helper script is missing from the repository.
- Drive the real `anota_ai` adapter against a local fake provider on `127.0.0.1:4010` so the app’s public webhook and reconciliation routes can be exercised over HTTP without live credentials.
- Fix the discovered live-bootstrap regression instead of documenting around it: fresh `anota_ai` databases must not seed demo orders or demo sync exceptions.

## Learnings
- Before the fix, `getProductionRepository()` always seeded demo orders/exceptions, which polluted live-mode QA and would have broken a clean pilot rollout.
- The Phase 1 HTTP surface is fully testable locally with a fake provider plus route secrets; replay and reconciliation behavior can be verified without mocking the app service layer.
- The final local QA environment still cannot confirm token owners, webhook console configuration, or production scheduler cadence because those are deployment concerns outside the repository.

## Files / Surfaces
- `src/infrastructure/sqlite.ts`
- `src/infrastructure/sqlite.sync.test.ts`
- `README.md`
- `docs/live-integration-phase-1.md`
- `qa/live-integration-post-qa-checklist.md`
- `qa/verification-report.md`
- `qa/test-cases/SMOKE-002.md`
- `qa/test-cases/TC-INT-002.md`
- `qa/test-cases/TC-INT-003.md`
- `qa/test-cases/TC-INT-004.md`
- `qa/test-cases/TC-INT-005.md`
- `qa/test-cases/TC-INT-006.md`
- `qa/test-cases/TC-FUNC-003.md`
- `qa/evidence/`
- `qa/screenshots/`

## Errors / Corrections
- `scripts/discover-project-contract.py` was referenced by the QA skill but is absent from the repo; command discovery fell back to `package.json`, `playwright.config.ts`, and the existing QA artifacts.
- The first manual Phase 1 run exposed demo-seeded live mode; the QA evidence was discarded, the bootstrap was fixed, and the full automated and manual QA passes were rerun from a clean `anota_ai` database.

## Ready for Next Run
- Remaining blockers are external to the codebase: live credential ownership, provider-side webhook setup, and scheduler cadence still need confirmation in a real pilot environment.
