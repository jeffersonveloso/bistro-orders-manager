# Task Memory: task_03.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Split the protected read surface so kitchens keep the board contract while salão gets its own read model and route.
- Enforce auth and area policy on `GET /api/board`, `GET /api/salon`, and `GET /api/orders/[orderId]` before any refresh side effect runs.

## Important Decisions

- Added dependency-injected `refresh` and `repository` inputs to the protected read handlers so tests can prove `auth-before-refresh` without global module mocks.
- Kept `getOrderDetailData()` domain semantics unchanged and enforced canonical kitchen behavior at the route layer to avoid redesigning the production read model in this task.
- Treated any order-detail fallback away from the authenticated kitchen as `403` to prevent leaking another kitchen's projection when an order does not contain the active kitchen.

## Learnings

- The existing production read model already had the pieces needed for a salão contract; extracting `getSalonData()` only required sharing the summary and metrics projection helpers.
- Route-level authorization must account for `getOrderDetailData()` falling back to the first ticket, otherwise direct reads could bypass kitchen focus rules.

## Files / Surfaces

- `src/application/production-service.ts`
- `src/application/production-service.test.ts`
- `app/api/board/route.ts`
- `app/api/orders/[orderId]/route.ts`
- `app/api/salon/route.ts`
- `app/api/protected-read-routes.test.ts`

## Errors / Corrections

- `git diff --stat` initially hid the new route files because they are untracked in the current worktree; used direct file review plus targeted/full verification instead.

## Ready for Next Run

- Task 04 should switch protected server pages to the same auth-first flow and update salão pages to use the dedicated salão read contract instead of relying on the kitchen board payload.
- Task 07 should point the salão client to `/api/salon` and preserve the canonical kitchen focus behavior already enforced on `/api/orders/[orderId]`.
