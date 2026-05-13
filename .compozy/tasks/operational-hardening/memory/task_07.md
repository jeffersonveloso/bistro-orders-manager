# Task Memory: task_07.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Align `dashboard-client`, `salon-client`, and `order-detail-client` with the protected route set, remove invalid cross-surface shortcuts, and keep cross-kitchen coordination visible without exposing wrong-area actions.

## Important Decisions

- Centralized board, salão, and order-detail query keys plus mutation invalidation in `src/components/kds/production-client-contracts.ts` so protected client contracts stay in one place.
- Normalized protected `401/403` handling in `src/lib/fetch-json.ts` and reused it through `ProtectedSurfaceFallback` / `ProtectedSurfaceBanner` to give operator screens a consistent re-entry path when sessions expire.
- Kept both kitchens visible on the board, but only the authenticated kitchen column remains interactive; sync-alert deep links now open only when the active kitchen owns the order.

## Learnings

- `DashboardClient` can be rendered under `QueryClientProvider` with `renderToStaticMarkup()` in Vitest to assert link exposure without adding a DOM test harness.
- Once salão reads moved to `/api/salon`, the acknowledge flow could assert on the follow-up GET response instead of reloading the page, which simplified the Playwright contract check.

## Files / Surfaces

- `app/page.tsx`
- `app/salon/page.tsx`
- `app/protected-pages.test.ts`
- `src/lib/fetch-json.ts`
- `src/lib/fetch-json.test.ts`
- `src/components/kds/production-client-contracts.ts`
- `src/components/kds/production-client-contracts.test.ts`
- `src/components/kds/protected-surface-feedback.tsx`
- `src/components/kds/dashboard-client.tsx`
- `src/components/kds/salon-client.tsx`
- `src/components/kds/order-detail-client.tsx`
- `e2e/dashboard-smoke.spec.ts`
- `e2e/order-detail.spec.ts`
- `e2e/salon-sync-exceptions.spec.ts`

## Errors / Corrections

- Corrected `app/salon/page.tsx` after the first pass so the protected salão page bootstraps `SalonData` via `getSalonData()` instead of the broader board payload.

## Ready for Next Run

- Task 08/09 should build QA artifacts from the updated protected client contract: no `/salon` or `/catalog` shortcuts on operator UIs, kitchen board actions limited to the active kitchen, and salão refresh driven by `/api/salon`.
