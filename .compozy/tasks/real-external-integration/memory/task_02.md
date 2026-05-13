# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Add additive SQLite sync storage for provider events, sync runs, provider order state, and order sync exceptions without changing existing production order semantics.
- Expose repository methods and query helpers that future sync orchestration and UI-decoration tasks can consume transactionally.

## Important Decisions
- Kept the implementation concentrated in `src/infrastructure/sqlite.ts` and expanded the SQLite repository boundary to implement both `ProductionRepository` and `ProviderSyncRepository`.
- Added unresolved-exception query helpers to `ProviderSyncRepository` so board/detail/salão work can consume active exception state without coupling directly to SQLite tables.
- Treated `acknowledged` exceptions as still active for query helpers; only `resolved` removes an exception from operational visibility.

## Learnings
- `provider_events` duplicate protection is enforced by SQLite uniqueness and bubbles through `recordInboundEvent`, which future sync orchestration should translate into duplicate-handling outcomes.
- `provider_orders` uses repository-level upsert semantics on top of a `(provider, external_order_id)` primary key, so later sync code can safely refresh canonical state without manual insert-vs-update branching.
- Coverage needed extra infrastructure-focused tests around init branches, repository guards, and singleton path handling to push overall branch coverage above the task threshold.

## Files / Surfaces
- `src/application/ports.ts`
- `src/application/provider-sync-contracts.test.ts`
- `src/infrastructure/sqlite.ts`
- `src/infrastructure/sqlite.sync.test.ts`

## Errors / Corrections
- Fixed the provider sync contract test double after extending `ProviderSyncRepository` with unresolved-exception read methods.
- Corrected a test assumption that demo scenario hooks would create seeded orders for a custom provider; the branch is now verified without assuming mock-provider data.

## Ready for Next Run
- Task 04 can now build sync orchestration against durable event/run/provider-order/exception storage plus `runInTransaction`.
- Task 06 can use the unresolved exception queries to decorate board/detail/salão payloads without adding new SQLite reads first.
