# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Add dedicated Phase 1 provider sync contracts in `src/domain/provider-sync.ts`.
- Extend `src/application/ports.ts` with sync provider and repository interfaces without breaking the existing production import flow.
- Add tests for sync enums/helpers and preserve compatibility with current mock and production tests.

## Important Decisions
- Keep storage-specific JSON column concerns out of the application ports; repository contracts will use structured payload and snapshot types.
- Introduce reusable provider identity helpers in the sync domain so later routes and repositories can validate provider-scoped inputs without leaking raw strings everywhere.
- Keep `OrderProviderPort` unchanged for the existing mock import flow and add separate sync-specific ports for incremental rollout.

## Learnings
- The current codebase has no dedicated sync module yet; provider sync concerns are still absent from the domain layer.
- Existing tests already exercise the mock import path through `syncOrders` and `createProductionTestContext`, so backward compatibility can be validated without broad refactors.
- TechSpec Phase 1 expects narrow lifecycle and exception contracts centered on `webhook`, `reconciliation`, `replay`, canonical snapshots, and exception persistence.
- Running coverage in this repo requires an explicit `@vitest/coverage-v8` devDependency and ESLint must ignore generated `coverage/` artifacts to keep the verification pipeline green.

## Files / Surfaces
- Implemented surfaces: `src/domain/provider-sync.ts`, `src/application/ports.ts`, `src/domain/provider-sync.test.ts`, `src/application/provider-sync-contracts.test.ts`, `src/application/order-sync-service.test.ts`, `src/application/production-service.test.ts`, `eslint.config.mjs`, `package.json`, and `package-lock.json`.

## Errors / Corrections
- Coverage verification initially failed because `@vitest/coverage-v8` was not installed even though the lockfile referenced it; installed the package explicitly.
- Lint initially failed after coverage generation because `coverage/` was not ignored by flat-config ESLint; added generated artifact ignores in `eslint.config.mjs`.

## Ready for Next Run
- Task 01 is complete. Task 02 can implement SQLite sync tables against the structured `ProviderSyncRepository` contracts and application-level snapshot/event types introduced here.
