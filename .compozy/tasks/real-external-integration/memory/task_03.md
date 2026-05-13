# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Add the real Anota AI sync adapter and a provider-selection boundary that preserves mock demo/test flows while normalizing provider payloads into canonical snapshots and production input.

## Important Decisions
- Kept all Anota HTTP concerns in `src/infrastructure/anota-ai-provider.ts`, including header construction, URL assembly, response envelope parsing, and payload normalization.
- Mapped Anota `check` values into the Phase 1 lifecycle set as: `0 -> pending_confirmation`, `1/2/3 -> confirmed_ready`, and `4/5/6 -> canceled`, while preserving the more specific provider status string for downstream diagnostics.
- Treated provider catalog `externalId` / `external_id` as the only accepted source for internal `menuItemId`; snapshot normalization keeps missing values visible and `toProductionInput()` fails descriptively instead of guessing by item name.
- Kept local fallback flows provider-agnostic by expanding the mock adapter to implement `OrderSyncProviderPort` and emit canonical snapshots under provider name `anota_ai`.

## Learnings
- The Anota partner API uses `Authorization: <token>` rather than `Bearer`, exposes canonical order detail at `/partnerauth/ping/get/{orderId}`, and exposes summary listing at `/partnerauth/ping/list`.
- The list payload is summary-only, so confirmed-order listing must hydrate each candidate through canonical detail fetch before downstream sync code can safely build production input.

## Files / Surfaces
- `src/infrastructure/anota-ai-provider.ts`
- `src/infrastructure/order-provider-factory.ts`
- `src/infrastructure/mock-order-provider.ts`
- `src/infrastructure/anota-ai-provider.test.ts`
- `src/infrastructure/order-provider-factory.test.ts`
- `src/infrastructure/mock-order-provider.test.ts`

## Errors / Corrections
- Corrected the real adapter so `listConfirmedOrders({})` matches the mock contract and paginates across all available Anota list pages instead of truncating to a single page when `limit` is omitted.

## Ready for Next Run
- Task 04 can wire sync orchestration against `createConfiguredOrderSyncProvider()` and `OrderSyncProviderPort` without introducing provider-specific branches in application services.
