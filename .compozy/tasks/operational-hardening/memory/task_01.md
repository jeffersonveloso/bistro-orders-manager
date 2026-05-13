# Task Memory: task_01.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot

- Implement the reusable area-auth foundation for Operational Hardening: dedicated area policy types, signed cookie sessions, runtime config loading, and shared auth-first route guards with tests.

## Important Decisions

- Kept role and surface rules out of `src/domain/production.ts` by introducing `src/domain/area-access.ts` and concentrating higher-level policy in `src/application/area-access-service.ts`.
- Standardized runtime session transport on `bistro_area_session` with HMAC-SHA256 signing, default 16-hour TTL, `HttpOnly` / `SameSite=Lax` / `Path=/`, `Secure` outside development, and renewal only inside the final 25% of TTL.
- Added `withAreaSession`, `withKitchenArea`, and `withSalonArea` wrappers in `app/api/_lib/area-access-route.ts` so handlers can fail with `401`, `403`, or `503` before protected callbacks run.

## Learnings

- The existing `jsonNoStore` helper pattern was sufficient for the new auth wrappers; no changes to `src/application/ports.ts` were needed.
- Targeted coverage for the new auth surface is 91.32% statements / 85.31% branches / 95.91% functions / 91.32% lines.
- Full repository verification also passed after the changes: `npm run lint`, `npm run test:run`, and `npm run build`.

## Files / Surfaces

- `src/domain/area-access.ts`
- `src/application/area-access-service.ts`
- `src/infrastructure/area-session.ts`
- `app/api/_lib/area-access-route.ts`
- `src/domain/area-access.test.ts`
- `src/application/area-access-service.test.ts`
- `src/infrastructure/area-session.test.ts`
- `app/api/_lib/area-access-route.test.ts`

## Errors / Corrections

- Removed an unused `AreaId` import in `src/infrastructure/area-session.ts` after targeted eslint surfaced it during verification.

## Ready for Next Run

- Task 02 can consume the new session/auth utilities directly for `/access` login and logout.
- Tasks 03, 05, and 06 should insert the new guard wrappers before `maybeRefreshRuntimeProviderSync()` or repository mutation work.
