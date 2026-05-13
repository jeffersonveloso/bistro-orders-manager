# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Protect `app/page.tsx`, `app/salon/page.tsx`, `app/orders/[orderId]/page.tsx`, and `app/catalog/page.tsx` with server-side area checks before any protected refresh or page bootstrap work.
- Canonicalize kitchen detail access to the authenticated kitchen and redirect wrong-area page access to the area's operational home.

## Important Decisions

- Added a shared server-page guard helper at `app/_lib/area-access-page.ts` so protected App Router pages reuse the same session parsing and wrong-area redirect rules instead of duplicating cookie logic.
- Kept `app/salon/page.tsx` bootstrapping `DashboardData` for now, even though task 03 introduced `SalonData`, to preserve the current hydration contract until task 07 updates `SalonClient`.
- Deferred `/catalog` by redirecting all currently defined Stage 6 areas away from the page immediately after auth succeeds, which prevents any catalog bootstrap work from running in this phase.

## Learnings

- `getOrderDetailData()` still needs an aggregate ownership check ahead of refresh on the page path, otherwise a single-kitchen order can fall back to the other kitchen after auth and leak the wrong projection.
- Page-level canonicalization differs from login `next` normalization: `/orders/[orderId]` without `kitchen` should redirect to the authenticated kitchen detail path, while invalid login `next` targets still fall back to the area home.
- The salão acknowledge mutation persists correctly under the new guards, but the current `SalonClient` still needs a full reload to render the updated exception state because its protected live-query alignment is deferred to task 07.

## Files / Surfaces

- `app/_lib/area-access-page.ts`
- `app/page.tsx`
- `app/salon/page.tsx`
- `app/orders/[orderId]/page.tsx`
- `app/catalog/page.tsx`
- `app/protected-pages.test.ts`
- `e2e/access-flow.spec.ts`
- `e2e/dashboard-smoke.spec.ts`
- `e2e/order-detail.spec.ts`
- `e2e/salon-sync-exceptions.spec.ts`
- `e2e/api-contract.spec.ts`
- `e2e/support/access.ts`
- `src/domain/area-access.ts`
- `src/domain/area-access.test.ts`
- `src/application/area-access-service.ts`

## Errors / Corrections

- Corrected the initial `AreaAccessConfigurationError` import in the new page guard helper; the error type belongs to `src/infrastructure/area-session.ts`, not the application layer.

## Ready for Next Run

- Run the full verification pipeline next: lint, Vitest with coverage, build, and Playwright.
- Task 07 should switch `SalonClient` to the protected salão contract so exception acknowledgements update without requiring a page reload.
