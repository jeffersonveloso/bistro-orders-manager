# Workflow Memory

Keep only durable, cross-task context here. Do not duplicate facts that are obvious from the repository, PRD documents, or git history.

## Current State

- Tasks 02 through 07 now cover the access flow, protected pages, protected read APIs, protected write APIs, deferred catalog APIs, and operator client/E2E alignment; remaining work starts with QA planning in task 08.

## Shared Decisions

- Area sessions use the `bistro_area_session` signed cookie with HMAC-SHA256, default TTL of 16 hours, and renewal only when the remaining lifetime is within the final 25%.
- Protected API handlers should reuse `withAreaSession`, `withKitchenArea`, or `withSalonArea` from `app/api/_lib/area-access-route.ts` so `401/403/503` checks happen before provider refresh or repository side effects.

## Shared Learnings

- The existing route-helper style (`jsonNoStore` plus dependency-injected handler functions) fits the auth guard wrapper cleanly, so later protected routes do not need a new helper pattern.
- `getOrderDetailData()` still falls back to the first available kitchen ticket when the requested kitchen is unavailable, so protected order-detail pages and handlers must validate the resolved `focusKitchenId` against the authenticated kitchen and return `403` on cross-kitchen fallback.
- After task 07, the salão operator client reads `/api/salon` directly and acknowledge mutations refresh state through dedicated salão-query invalidation, so browser assertions can wait for the follow-up `GET /api/salon` instead of forcing a page reload.
- Preserving existing `400/404` behavior on protected write routes works best when the guard layer checks session and area ownership first, then falls through to the existing handler for payload validation and not-found semantics.
- Catalog-route deferral works cleanly by wrapping the public exports with `withAreaSession()` and returning `403` before calling the existing direct handlers, which preserves the future admin contract without allowing denied requests to parse bodies or reach provider/repository work.
- The repo does not currently provide the `scripts/discover-project-contract.py` helper expected by `qa-execution`, so QA tasks must discover the verify contract manually from `package.json`, test configs, and existing `qa/` artifacts until that helper is added.
- Auth tests that exercise exported routes or direct page renders should avoid same-day hard-coded cookie expiries unless they also inject `now`; far-future default session expiries keep non-expiry assertions deterministic while explicit expiry tests still control the timestamp directly.

## Open Risks

- Task 08 and task 09 must keep explicit coverage for the deferred catalog APIs and expired-session client fallbacks so kitchen and salão flows do not regress into exposing blocked surfaces or dead-end polling errors.

## Handoffs

- Task 03 can assume sessions are issued by the new access login route and can start protecting kitchen and salão read APIs against the signed cookie.
- Task 04 can redirect unauthenticated page requests to `/access`; the access page already handles valid-session canonical redirects and supports `reason=expired` / `reason=signed_out` messaging.
- Task 07 can assume direct wrong-area ticket, item, sync-exception acknowledge, and catalog requests now fail before repository mutation or sync-service side effects.
- Tasks 08 and 09 can assume the kitchen board only exposes active-kitchen actions, the salão UI is bound to `/api/salon`, and protected client failures now surface re-entry actions through the shared fetch helper.
