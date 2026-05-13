# Operational Hardening TechSpec

## Executive Summary

Operational Hardening should add area authentication to the existing Next.js production surfaces with the smallest durable change set: a signed HTTP-only area session cookie, environment-backed area PINs, a dedicated `/access` entry flow, and explicit server-side authorization in pages and API handlers. The kitchen production domain, SQLite production data, and provider-sync model remain intact.

The primary trade-off is deliberate. We accept explicit guard calls in protected pages and handlers, plus one new salão-specific read contract, instead of adding a middleware-first access layer or a database-backed credential system. That keeps the authorization boundary close to the routes that already own production reads and writes, and it makes auth-before-side-effect ordering auditable.

## System Architecture

### Component Overview

- `src/domain/area-access.ts`
  - New pure domain module for `AreaId`, route policy rules, and canonical area-to-surface mapping.
- `src/application/area-access-service.ts`
  - New application service for PIN validation, kitchen versus salão policy checks, and canonical kitchen resolution from the active area session.
- `src/infrastructure/area-session.ts`
  - New server-only infrastructure module for env config loading, HMAC signing and verification, expiry and renewal checks, and cookie serialization.
- `app/api/_lib/area-access-route.ts`
  - New shared route helper for standardized session extraction, `401/403` responses, and auth-before-side-effect guard flow in route handlers.
- `app/access/page.tsx`
  - New dedicated access page for area selection, PIN entry, invalid-PIN feedback, and area switch re-entry.
- `app/api/access/session/route.ts`
  - New login route that validates area PINs, validates `next` against per-area allowlists, issues the signed session cookie, and returns the canonical destination.
- `app/api/access/logout/route.ts`
  - New logout or switch-area route that clears the cookie.
- `app/page.tsx`
  - Modified kitchen board page. Requires a kitchen area session before any protected work runs, then refreshes provider state and renders the board.
- `app/salon/page.tsx`
  - Modified salão page. Requires a salão session before any protected work runs and stops using the kitchen board payload.
- `app/orders/[orderId]/page.tsx`
  - Modified detail page. Requires a kitchen session before any protected work runs and normalizes focus to the authenticated kitchen.
- `app/catalog/page.tsx`
  - Modified catalog page. Enters the same auth stack but is blocked for all current Stage 6 areas and redirects authenticated users back to their canonical home surface.
- `app/api/board/route.ts`
  - Modified kitchen-only board read endpoint. Session and area must be validated before `maybeRefreshRuntimeProviderSync()` runs.
- `app/api/salon/route.ts`
  - New salão-only read endpoint returning a reduced salão contract. Session and area must be validated before any refresh or read-model work runs.
- `app/api/orders/[orderId]/route.ts`
  - Modified kitchen-only detail read endpoint. Session and area must be validated before `maybeRefreshRuntimeProviderSync()` runs. Missing `kitchen` is normalized from the session area.
- `app/api/orders/[orderId]/tickets/[kitchenId]/route.ts`
  - Modified kitchen mutation endpoint. Requires the session kitchen to match `kitchenId` before any repository mutation runs.
- `app/api/orders/[orderId]/items/[itemId]/route.ts`
  - Modified item mutation endpoint. Requires the active kitchen to own the target item before any repository mutation runs.
- `app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts`
  - Modified salão-only exception acknowledgement endpoint.
- `app/api/catalog/mappings/route.ts`
  - Modified catalog endpoint. Requires a session but returns `403` for `kitchen-1`, `kitchen-2`, and `salon`.
- `app/api/catalog/provider-pull/route.ts`
  - Modified provider-assisted catalog endpoint. Requires a session but returns `403` for `kitchen-1`, `kitchen-2`, and `salon`.
- `src/application/production-service.ts`
  - Modified to add `getSalonData()` and shared projection helpers so salão no longer consumes the full kitchen board payload.
- `src/components/kds/dashboard-client.tsx`
  - Modified to receive the active kitchen, remove cross-surface shortcuts, and keep wrong-area actions impossible.
- `src/components/kds/salon-client.tsx`
  - Modified to query `/api/salon` instead of `/api/board` and to remove the catalog shortcut.
- `src/components/kds/order-detail-client.tsx`
  - Modified to operate only on the authenticated kitchen focus.

Data flow:

1. Unauthenticated page access redirects to `/access`.
2. `/access` posts area plus PIN to `POST /api/access/session`.
3. The server validates the env-backed PIN, validates `next`, signs the session cookie, and returns the canonical destination.
4. Protected pages and handlers resolve and authorize the session before any protected side effect runs, including `maybeRefreshRuntimeProviderSync()`, repository mutation, or expensive read-model preparation.
5. Kitchen pages continue to use the existing production read models, while salão uses a reduced read contract and catalog routes stay blocked for all current Stage 6 roles.

## Implementation Design

### Core Interfaces

Primary authorization contract, shown in Go-like form for spec clarity while implementation remains TypeScript:

```go
type AreaAuthorizer interface {
    Authenticate(areaID string, pin string) (AreaSession, error)
    RequireKitchen(session AreaSession) (string, error)
    RequireSalon(session AreaSession) error
    ResolveFocusKitchen(session AreaSession, requestedKitchenID string) (string, error)
    ValidateNextTarget(session AreaSession, next string) (string, error)
}
```

```ts
export type AreaId = "kitchen-1" | "kitchen-2" | "salon";

export interface AreaSession {
  areaId: AreaId;
  issuedAt: string;
  expiresAt: string;
  version: 1;
}
```

```ts
export interface AreaAccessService {
  authenticate(areaId: AreaId, pin: string): AreaSession;
  requireKitchenArea(session: AreaSession): "kitchen-1" | "kitchen-2";
  requireSalonArea(session: AreaSession): void;
  resolveFocusKitchen(session: AreaSession, requestedKitchenId?: string): "kitchen-1" | "kitchen-2";
  resolveNextTarget(session: AreaSession, next?: string): string;
}
```

```ts
export interface SalonData {
  summary: DashboardData["salonSummary"];
  metrics: DashboardData["metrics"];
  openSyncExceptions: number;
  generatedAt: string;
}
```

Error handling conventions:

- Missing or invalid session on API routes: `401 Unauthorized`
- Valid session with wrong-area access on API routes: `403 Forbidden`
- Missing or expired session on pages: redirect to `/access`
- Wrong-area page access: redirect to the canonical surface for that area
- Invalid login payload: `400`
- Invalid PIN: `401`
- Missing auth runtime configuration: `503`

### Data Models

Core entities:

- `AreaId`
  - `"kitchen-1" | "kitchen-2" | "salon"`
- `AreaSession`
  - `areaId: AreaId`
  - `issuedAt: string`
  - `expiresAt: string`
  - `version: 1`
- `AreaPinConfig`
  - `sessionSecret: string`
  - `sessionTtlHours: number`
  - `pins.kitchen1: string`
  - `pins.kitchen2: string`
  - `pins.salon: string`
- `LoginAreaRequest`
  - `areaId: AreaId`
  - `pin: string`
  - optional `next: string`
- `LoginAreaResponse`
  - `areaId: AreaId`
  - `redirectTo: string`

Session cookie policy:

- `HttpOnly=true`
- `SameSite=Lax`
- `Secure=true` outside development
- `Path=/`
- `Max-Age` derived from `BISTRO_ACCESS_SESSION_TTL_HOURS`, defaulting to a shift-length value such as `16`

Session envelope:

- Cookie payload uses a compact signed structure such as `v1.<base64url-json>.<base64url-hmac>`
- Signature algorithm: HMAC-SHA256 using `BISTRO_ACCESS_SESSION_SECRET`
- Payload fields: `areaId`, `issuedAt`, `expiresAt`, `version`

Session renewal policy:

- Sliding expiration is enabled.
- Protected page and API responses reissue the cookie only when remaining lifetime is below the final `25%` of the configured TTL.
- Unauthorized or wrong-area requests never renew the cookie.
- Renewal happens only after successful authorization to avoid issuing fresh cookies during rejected requests.

Read models:

- `DashboardData`
  - Existing shape remains intact.
  - Accessible only to kitchen sessions.
  - The page layer receives `activeKitchenId` separately for UI behavior.
- `OrderDetailData`
  - Existing shape remains intact.
  - `focusKitchenId` must resolve to the authenticated kitchen area.
- `SalonData`
  - New reduced contract for salão:
  - `summary`
  - `metrics`
  - `openSyncExceptions`
  - `generatedAt`

Storage structures:

- No SQLite schema change in this slice.
- Area PINs live in environment variables.
- Session state lives in a signed HTTP-only cookie, not in SQLite.
- Existing production tables and sync-exception tables remain unchanged.

Recommended environment variables:

- `BISTRO_ACCESS_SESSION_SECRET`
- `BISTRO_ACCESS_PIN_KITCHEN_1`
- `BISTRO_ACCESS_PIN_KITCHEN_2`
- `BISTRO_ACCESS_PIN_SALON`
- optional `BISTRO_ACCESS_SESSION_TTL_HOURS`

Catalog scope rule:

- No catalog credential or role model is added in this slice.
- Catalog surfaces join the same auth stack but are denied to all current areas.
- Catalog administration is explicitly deferred until a later admin or manager scope exists.

### API Endpoints

- `GET /access`
  - Public entry page.
  - If a valid session exists, redirect to the canonical area home.
- `POST /api/access/session`
  - Request: `{ areaId, pin, next? }`
  - Auth: public
  - `next` must be a same-origin relative path and must pass the area allowlist.
  - Allowlist:
    - `kitchen-1`: `/`, `/orders/<orderId>`, `/orders/<orderId>?kitchen=kitchen-1`
    - `kitchen-2`: `/`, `/orders/<orderId>`, `/orders/<orderId>?kitchen=kitchen-2`
    - `salon`: `/salon`
  - Invalid or disallowed `next` falls back to the canonical area home.
  - If `next` targets `/orders/<orderId>` without a `kitchen` query, the route normalizes it to the authenticated kitchen before redirecting.
  - Response `200`: `{ areaId, redirectTo }` plus `Set-Cookie`
  - Response `400`: invalid body
  - Response `401`: invalid PIN
  - Response `503`: missing auth runtime configuration
- `POST /api/access/logout`
  - Clears the session cookie
  - Response `204`
- `GET /api/board`
  - Kitchen sessions only
  - Auth and area policy must run before `maybeRefreshRuntimeProviderSync()`
  - Response `200`: `DashboardData`
  - Response `401`: no or invalid session
  - Response `403`: non-kitchen session
- `GET /api/salon`
  - Salão session only
  - Auth and area policy must run before `maybeRefreshRuntimeProviderSync()`
  - Response `200`: `SalonData`
  - Response `401`: no or invalid session
  - Response `403`: non-salão session
- `GET /api/orders/[orderId]`
  - Kitchen sessions only
  - Auth and area policy must run before `maybeRefreshRuntimeProviderSync()`
  - If `kitchen` query is absent, the handler derives the focus kitchen from the authenticated area and returns that projection
  - If `kitchen` query is present and does not match the authenticated kitchen, return `403`
  - `salon` always receives `403`
  - Response `404`: order not found after authorization
- `PATCH /api/orders/[orderId]/tickets/[kitchenId]`
  - Kitchen mutation
  - Auth and area policy must run before any repository mutation
  - Session kitchen must match path `kitchenId`
  - Response `200`, `400`, `401`, `403`, or `404`
- `PATCH /api/orders/[orderId]/items/[itemId]`
  - Kitchen mutation
  - Auth and area policy must run before any repository mutation
  - The route resolves the target item from `getOrderAggregate(orderId)` and rejects mutations where the item kitchen does not match the session kitchen
  - Response `200`, `400`, `401`, `403`, or `404`
- `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`
  - Salão session only
  - Response `200`, `401`, `403`, or `404`
- `GET /api/catalog/mappings`
  - Requires a session
  - Returns `403` for `kitchen-1`, `kitchen-2`, and `salon`
- `POST /api/catalog/mappings`
  - Requires a session
  - Returns `403` for `kitchen-1`, `kitchen-2`, and `salon`
- `POST /api/catalog/provider-pull`
  - Requires a session
  - Returns `403` for `kitchen-1`, `kitchen-2`, and `salon`

## Integration Points

No new external service is introduced in this slice. Existing provider webhook and reconciliation flows remain unchanged. The only new runtime boundary is environment-based PIN and session-secret configuration.

## Impact Analysis

| Component | Impact Type | Description and Risk | Required Action |
|-----------|-------------|---------------------|-----------------|
| `src/domain/area-access.ts` | new | Core policy definitions; medium risk | Add area enums, canonical surfaces, and policy helpers |
| `src/application/area-access-service.ts` | new | Central authorization logic; high risk | Add PIN validation, policy enforcement, and `next` normalization |
| `src/infrastructure/area-session.ts` | new | Cookie integrity, expiry, and renewal are central to all protected flows; high risk | Add signing, verification, renewal, and cookie serialization |
| `app/api/_lib/area-access-route.ts` | new | Shared route guard ordering must be correct; high risk | Add session extraction and fail-fast `401/403` helpers |
| `app/access/page.tsx` | new | New entry surface for all roles; medium risk | Build area and PIN flow and session-aware redirects |
| `app/api/access/session/route.ts` | new | Login gate for all protected surfaces; high risk | Add body validation, allowlisted redirect handling, and cookie issue |
| `app/api/access/logout/route.ts` | new | Shared-device area switch support; low risk | Clear cookie and return `204` |
| `app/page.tsx` | modified | Board becomes kitchen-authenticated and must guard before refresh side effects; high risk | Insert auth-first guard flow |
| `app/salon/page.tsx` | modified | Must stop using board payload and must guard before refresh side effects; high risk | Insert auth-first guard flow and switch to salão data |
| `app/orders/[orderId]/page.tsx` | modified | Wrong-area focus must be blocked before refresh side effects; high risk | Canonicalize kitchen and redirect before protected work |
| `app/api/board/route.ts` | modified | Kitchen-only read enforcement; high risk | Add guard before refresh |
| `app/api/salon/route.ts` | new | New salão-only read contract; medium risk | Add route and reuse projection helpers |
| `app/api/orders/[orderId]/route.ts` | modified | Wrong-area detail reads must be impossible; high risk | Add guard before refresh and canonical focus behavior |
| `app/api/orders/*` mutations | modified | Wrong-area production writes must be impossible; high risk | Add session and ownership checks before repository work |
| `app/catalog/page.tsx` | modified | Public write-adjacent surface becomes intentionally blocked; medium risk | Protect route and redirect all current areas away |
| `app/api/catalog/mappings/route.ts` | modified | Existing public read/write API becomes forbidden to current areas; high risk | Add auth and explicit `403` policy |
| `app/api/catalog/provider-pull/route.ts` | modified | Existing public provider-assisted API becomes forbidden to current areas; high risk | Add auth and explicit `403` policy |
| `src/application/production-service.ts` | modified | Must split salão reads from board reads without schema changes; medium risk | Add `getSalonData()` and shared projections |
| `src/components/kds/dashboard-client.tsx` | modified | Must stop advertising other protected surfaces and reflect active-area behavior; medium risk | Remove `/salon` and `/catalog` shortcuts and respect active area |
| `src/components/kds/salon-client.tsx` | modified | Must move to the new salão contract and remove deferred surfaces; low risk | Swap query target and remove `/catalog` shortcut |
| `tests and e2e` | modified | Authorization regressions are release-blocking; high risk | Extend Vitest and Playwright |

## Testing Approach

### Unit Tests

- Add tests for area policy helpers and canonical destination rules.
- Add session tests for cookie signing, expiry, renewal-window behavior, and malformed payloads.
- Add login route tests for valid PIN, invalid PIN, invalid `next`, and missing config.
- Refactor protected handlers to expose testable `handle*` functions with dependency injection where needed so auth-before-side-effect ordering can be asserted.
- Extend board, salão, detail, kitchen-ticket, item-mutation, catalog, and acknowledge handlers with:
  - no-session case
  - expired-session case
  - wrong-area case
  - authorized case when applicable
- Add item-mutation authorization tests proving a kitchen cannot mutate an item owned by the other kitchen.
- Add route tests proving unauthorized requests return before:
  - `maybeRefreshRuntimeProviderSync()`
  - repository mutation calls
  - provider-assisted catalog pull work

### Integration Tests

- Reuse `createProductionTestContext()` for handler-level repository integration checks.
- Extend Playwright coverage for:
  - access entry and redirect to correct area home
  - kitchen board load after login
  - kitchen detail access for the matching kitchen
  - blocked wrong-kitchen detail access
  - blocked wrong-area write attempts
  - salão login and exception acknowledgement
  - blocked salão access to kitchen board and order detail
  - blocked access to `/catalog` for all current areas
  - session persistence through routine navigation
  - explicit area switch or logout flow

## Development Sequencing

### Build Order

1. Add area domain types, env config loading, signed session utilities, cookie policy, and renewal helpers; no dependencies.
2. Add `/access`, `POST /api/access/session`, `POST /api/access/logout`, and `next` allowlist validation; depends on step 1.
3. Protect `app/page.tsx`, `app/salon/page.tsx`, and `app/orders/[orderId]/page.tsx`, and add `GET /api/salon`; depends on steps 1-2.
4. Protect `GET /api/board`, `GET /api/orders/[orderId]`, and all production mutation routes, ensuring guards run before `maybeRefreshRuntimeProviderSync()` or repository work; depends on steps 1-3.
5. Protect and defer `/catalog`, `GET/POST /api/catalog/mappings`, and `POST /api/catalog/provider-pull`; remove catalog links from operational UIs; depends on steps 1-3.
6. Extend Vitest and Playwright coverage for authorized, unauthorized, wrong-area, renewal-window, and deferred-catalog flows; depends on steps 1-5.

### Technical Dependencies

- The runtime must provide all access env vars before boot.
- Test runners must inject deterministic PIN and session-secret values.
- No database migration is required.
- No new package is required; Node `crypto` is sufficient for cookie signing.
- Protected page and route refactors may need lightweight dependency injection seams so tests can prove that guards run before operational side effects.

## Monitoring and Observability

- Emit structured server logs for:
  - `area_login_success`
  - `area_login_failure`
  - `area_access_denied`
  - `area_session_expired`
  - `area_session_renewed`
  - `area_logout`
- Include fields:
  - `areaId`
  - `surface`
  - `route`
  - `orderId?`
  - `kitchenId?`
  - `reason`
- Release-blocking signal:
  - any test that demonstrates a successful wrong-area production mutation
  - any test that demonstrates a successful wrong-area protected read
  - any test that demonstrates an unauthorized request triggering protected operational side effects
- Pilot review thresholds:
  - repeated login failures on the same area device
  - repeated forbidden hits on the same surface, which indicates UX confusion
- This slice does not add a new alerting system. Logs plus automated verification are the immediate observability layer.

## Technical Considerations

### Key Decisions

- Use a signed HTTP-only cookie instead of a client-side bearer token or SQLite session table.
- Keep area PINs in environment variables instead of adding credential persistence.
- Enforce authorization explicitly in pages and route handlers instead of a middleware-first design.
- Require guards to run before `maybeRefreshRuntimeProviderSync()`, repository mutation, or other protected side effects.
- Split salão reads into a dedicated API contract instead of continuing to expose the full board payload.
- Protect catalog routes with the same auth stack but deny all current Stage 6 roles rather than silently leaving a public write-capable escape hatch.
- Require both Vitest and Playwright coverage because the feature must block direct API misuse and preserve real operator flows.

### Known Risks

- Shared area PINs provide area accountability only, not individual attribution.
- A missed guard in a page or handler would create an inconsistent enforcement surface.
- Deferring catalog administration closes a public escape hatch, but it also removes an existing in-product maintenance surface until a later admin scope exists.
- Renewal-window logic can become noisy if applied too aggressively to polling routes.
- Existing internal routes outside this slice may need a later pass if they must join the same authorization matrix.

Mitigations:

- Centralize auth checks in shared helpers and back them with route tests.
- Limit cookie renewal to the configured renewal window.
- Remove deferred-surface links from operator UIs and document the catalog deferral clearly.

## Architecture Decision Records

- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Starts Stage 6 with area PIN access and strict kitchen versus salão action boundaries.
- [ADR-002: Signed Area Session Cookie with Dedicated Access Entry](adrs/adr-002.md) — Uses env-backed area PINs plus a signed cookie with explicit policy and renewal rules.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Enforces read and write policy at protected page and handler boundaries, before protected side effects run.
- [ADR-004: Dual-Layer Authorization Validation with Vitest and Playwright](adrs/adr-004.md) — Requires both low-level and end-to-end authorization coverage, including auth-before-side-effect evidence.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Closes the catalog escape hatch and defers that surface until a later admin or manager scope.
