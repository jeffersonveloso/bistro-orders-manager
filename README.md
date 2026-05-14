# Bistro Orders Manager

Kitchen-first production system for the bistro **Vó Ziluca**. The MVP focuses on real kitchen execution for a layout with **two physical kitchens** separated by a wall.

The application receives raw orders from an internal provider boundary, splits items by kitchen using an internal mapping table, tracks kitchen ticket progress, and exposes a synchronized read-only summary for salão or expediting.

Phase 1 of the live rollout now adds a real external sync boundary for **Anota AI** without changing the kitchen domain model: webhook intake, scheduled reconciliation, sync exceptions, and a mock fallback remain behind internal interfaces.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS v4
- shadcn-style local UI components
- Radix UI primitives
- Lucide icons
- TanStack Query
- SQLite via `better-sqlite3`
- Playwright for E2E coverage

## Core Behavior

- Two kitchens: `Kitchen 1` and `Kitchen 2`
- Internal `menu item -> kitchen` mapping stored in SQLite
- Automatic order split into kitchen tickets
- Main Kanban board grouped by kitchen and ticket status
- Full-screen order detail focused on one kitchen while showing the other kitchen's progress
- Phase 1 sync alerts for:
  - missing provider catalog mapping
  - post-import external changes
  - external cancellations
  - technical ingestion failures
- Area-based access entry at `/access` with environment-backed PINs for `Kitchen 1`, `Kitchen 2`, and `Salão`
- Protected operational pages redirect unauthenticated devices to `/access`
- Wrong-area page access is canonicalized server-side:
  - kitchen sessions stay on `/` or `/orders/[orderId]?kitchen=<their-kitchen>`
  - salão sessions stay on `/salon`
- `/catalog` is available to `Kitchen 1` and `Kitchen 2` for catalog mapping maintenance; salão sessions are redirected back to `/salon`
- Fast operational actions:
  - start kitchen
  - mark item in preparation
  - mark item ready
  - complete kitchen
- Read-only salão summary with consolidated order readiness

## Status Model

### Item status

- `new`
- `in_preparation`
- `ready`

### Kitchen ticket status

- `new`: all ticket items are `new`
- `in_preparation`: at least one item started and not all are ready
- `ready`: all ticket items are `ready`

### Order status

- `new`
- `in_progress`
- `partially_ready`
- `ready_to_serve`

## Architecture

The code is intentionally split into four layers:

- `src/domain`
  - pure domain types and status rules
  - order split service
  - provider sync contracts and exception enums
- `src/application`
  - use-case orchestration
  - production read models
  - sync orchestration, mutation services, and exception presentation
- `src/infrastructure`
  - SQLite connection and repository
  - mock provider adapter
  - Anota AI adapter and provider factory
- `app` and `src/components`
  - HTTP interface
  - Next.js pages
  - client UI

This keeps the production workflow independent from the external order source.

## External Integration Boundary

The application does **not** couple production logic directly to Anota AI payload semantics.

- `OrderProviderPort` remains the legacy demo-import boundary used by seed flows.
- `OrderSyncProviderPort` defines the Phase 1 live sync contract.
- `ProviderSyncService` owns webhook, reconciliation, duplicate protection, and exception lifecycle.
- `createConfiguredOrderSyncProvider()` switches between `mock` and `anota_ai` using environment variables.

The system persists only internal production and sync state. Provider-specific behavior stays isolated in `src/infrastructure`.

## Phase 1 Live Integration

Phase 1 imports only **confirmed provider orders that are ready for production**. Scheduled or pre-confirmation states stay out of scope, and imported production orders are **not rewritten automatically** when the provider changes later.

Mode selection:

- `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock`
  - default local mode
  - keeps seeded demo orders and avoids any provider dependency
- `BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai`
  - enables the real Anota AI adapter
  - requires `BISTRO_ANOTA_AI_TOKEN`
  - expects shared secrets for webhook and reconciliation entry points
  - starts from a clean board on a fresh SQLite file instead of importing demo orders

Runtime contract for live mode:

- `BISTRO_ANOTA_WEBHOOK_SECRET` protects `POST /api/integrations/anota-ai/webhook` through `Authorization: Bearer <secret>` and still accepts `x-bistro-anota-webhook-secret` for local/manual compatibility
- `BISTRO_INTERNAL_SYNC_SECRET` protects `POST /api/internal/sync/anota-ai` through header `x-bistro-internal-sync-secret`
- `BISTRO_ANOTA_AI_BASE_URL` is optional; the adapter defaults to `https://api-parceiros.anota.ai/partnerauth`
- `BISTRO_ANOTA_AI_CATALOG_BASE_URL` is optional; the catalog admin adapter defaults to `https://api-menu.anota.ai/partnerauth`
- `BISTRO_ANOTA_AI_CATALOG_LIST_PATH` is optional; the catalog admin adapter defaults to `v2/nm-category/rest/simple-item/export/v2`
- `BISTRO_DATABASE_PATH` is optional and useful for isolated QA or pilot databases
- provider catalog `externalID` / `external_id` must match a stored local mapping binding; `menu_item_id` remains the Bistro-owned identifier, `provider_external_id` stores the provider-facing routing key, and `provider_item_id` stores the provider internal catalog item id when known
- during order import, the sync path prefers `externalID` and can fall back to a stored `provider_item_id` when the provider omits `externalID` on the order line but still exposes the catalog item id
- if any live provider item has no usable local mapping, the order fails closed and opens a sync exception instead of falling back to item names

Catalog maintenance:

- `/catalog`, `/api/catalog/mappings`, and `/api/catalog/provider-pull` are available to kitchen sessions (`kitchen-1`, `kitchen-2`)
- salão sessions remain blocked from catalog maintenance surfaces and are redirected or rejected by the access matrix
- the live adapter still depends on explicit local `menu item -> kitchen` mappings, which can now be maintained from the kitchen-facing catalog surface
- the provider pull still reads the provider catalog directly; for Anota AI it uses the category export endpoint on `api-menu.anota.ai`
- when a provider item arrives without `externalID`, the UUID-draft and provider `api_write` assistance are available through the kitchen-facing catalog workflow when the provider capability supports them
- Phase 1 does not auto-activate unmapped items into production; items without provider `externalID` remain blocked until that key is configured upstream

Operational docs:

- [docs/live-integration-phase-1.md](docs/live-integration-phase-1.md)
- [docs/anota-ai-smoke-test.md](docs/anota-ai-smoke-test.md)
- [qa/live-integration-post-qa-checklist.md](qa/live-integration-post-qa-checklist.md)

## Local Data

The app creates a local SQLite database at:

```bash
data/bistro-production.sqlite
```

Override it with `BISTRO_DATABASE_PATH` when you need an isolated file for QA, E2E, or a live-like rehearsal.

On startup it will:

1. create tables if needed
2. seed kitchens
3. in `mock` mode, seed demo menu item mappings and import demo orders through the mock provider adapter
4. in `mock` mode, apply demo operational scenarios and demo sync exceptions for acceptance coverage

Boot behavior by provider mode:

- `mock`: seeds demo mappings plus demo production data for local walkthroughs and acceptance coverage
- `anota_ai`: keeps only kitchens seeded; catalog mappings must be created intentionally through `/catalog` before live imports succeed

## Routes

- `/`
  - protected kitchen sync board
- `/access`
  - area selection, PIN entry, and area session bootstrap
- `/orders/[orderId]?kitchen=kitchen-1`
  - protected full-screen order detail focused on the authenticated kitchen
- `/salon`
  - protected read-only salão summary
- `/catalog`
  - protected kitchen-only catalog mapping surface
- `/api/board`
  - protected kitchen-only board payload
- `/api/orders/[orderId]`
  - protected kitchen-only order detail payload
- `/api/salon`
  - protected salão-only summary payload
- `/api/catalog/mappings`
  - protected kitchen-only catalog mapping endpoint
- `/api/catalog/provider-pull`
  - protected kitchen-only provider-catalog pull endpoint
- `/api/integrations/anota-ai/webhook`
  - provider-facing Phase 1 intake
- `/api/internal/sync/anota-ai`
  - authenticated reconciliation or replay trigger
- `/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`
  - salão acknowledgement of an unresolved sync exception

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local demo server:

```bash
npm run dev
```

To use the operator entry flow at `/access`, create `.env.local` with the area-session contract before booting the app:

```bash
cp .env.example .env.local
```

Open:

```bash
http://localhost:3000
```

Recommended operator path:

```bash
http://localhost:3000/access
```

Notes:

- `/access` shows a configuration warning and `POST /api/access/session` returns `503` until the access env vars above are present.
- Operational pages now enforce the area session in the App Router itself, so the intended operator flow starts at `/access` even in local development.

If you want to exercise the Phase 1 live adapter locally, create `.env.local` with the real-integration contract before booting the app:

```bash
cp .env.example .env.local
```

Then update `.env.local` to at least:

```bash
BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai
BISTRO_ANOTA_AI_TOKEN=replace-me
BISTRO_ANOTA_WEBHOOK_SECRET=replace-me
BISTRO_INTERNAL_SYNC_SECRET=replace-me
# optional
BISTRO_ANOTA_AI_BASE_URL=https://api-parceiros.anota.ai/partnerauth
# optional
BISTRO_DATABASE_PATH=data/bistro-production.live.sqlite
```

Do not switch to `anota_ai` until the provider catalog `externalID` values are bound in the local mapping table through a direct data load or future admin surface, and the operator secrets are provisioned.

## Validation

Run:

```bash
npm run lint
npm run test:run -- --coverage
npm run build
npm run test:e2e
```

## Docker

Build the production image locally:

```bash
docker build -t bistro-orders-manager .
```

Run the container with the minimum access-session contract:

```bash
docker run --rm -p 3000:3000 \
  -e BISTRO_ACCESS_SESSION_SECRET=replace-with-a-long-random-secret \
  -e BISTRO_ACCESS_PIN_KITCHEN_1=1111 \
  -e BISTRO_ACCESS_PIN_KITCHEN_2=2222 \
  -e BISTRO_ACCESS_PIN_SALON=3333 \
  bistro-orders-manager
```

Container notes:

- the image uses the Next.js standalone output
- the default provider mode inside the container is `mock`
- SQLite persists at `/app/data/bistro-production.sqlite` unless `BISTRO_DATABASE_PATH` is overridden

### Docker Compose

The repository now includes [`/docker-compose.yml`](docker-compose.yml) and [`/.env.docker.example`](.env.docker.example).

Recommended setup:

```bash
cp .env.docker.example .env.docker.homologation
cp .env.docker.example .env.docker.production
```

Adjust each file with the correct image tag, secrets, ports, and provider mode.

Suggested environment split:

- homologation:
  - `BISTRO_IMAGE=your-dockerhub-org/bistro-orders-manager:main-latest`
  - `BISTRO_CONTAINER_NAME=bistro-orders-manager-homologation`
  - `BISTRO_PORT=3001`
  - `BISTRO_DATA_VOLUME=bistro-orders-manager-homologation-data`
- production:
  - `BISTRO_IMAGE=your-dockerhub-org/bistro-orders-manager:latest`
  - `BISTRO_CONTAINER_NAME=bistro-orders-manager-production`
  - `BISTRO_PORT=3000`
  - `BISTRO_DATA_VOLUME=bistro-orders-manager-production-data`

Start homologation:

```bash
docker compose --env-file .env.docker.homologation up -d
```

Start production:

```bash
docker compose --env-file .env.docker.production up -d
```

Update an environment after a new image is published:

```bash
docker compose --env-file .env.docker.production pull
docker compose --env-file .env.docker.production up -d
```

Compose notes:

- the same `docker-compose.yml` serves homologation and production; the env file selects the image tag, runtime secrets, and host port
- SQLite now persists in a Docker named volume selected by `BISTRO_DATA_VOLUME`, so container recreation or image updates do not remove the database
- sensitive values stay outside the image and are injected only at container startup
- if you switch to `BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai`, also fill `BISTRO_ANOTA_AI_TOKEN`, `BISTRO_ANOTA_WEBHOOK_SECRET`, and `BISTRO_INTERNAL_SYNC_SECRET`
- deleting the container does not delete the database; deleting the named volume does

## GitHub Actions

The repository now includes [`/.github/workflows/build.yml`](.github/workflows/build.yml).

On every push to `main`, the workflow:

- installs dependencies with `npm ci`
- runs `npm run lint`
- runs `npm run build`
- uploads the standalone build output as an artifact
- validates the `Dockerfile` by building the image with Buildx
- publishes the Docker image to Docker Hub when `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` are configured as GitHub repository secrets

Docker Hub publication contract:

- required secrets:
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`
- optional repository variables:
  - `DOCKERHUB_ORG`
  - `DOCKERHUB_IMAGE_NAME`
- generated tags on `main`:
  - `latest`
  - `main-latest`
  - `main-<short-sha>`

Validation notes:

- `npm run test:e2e` is the seeded browser regression suite for the local kitchen MVP. The Playwright web server forces `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock` and an isolated SQLite file so the suite stays stable even when `.env.local` is configured for `anota_ai`.
- Phase 1 adapter validation is tracked separately in [docs/anota-ai-smoke-test.md](docs/anota-ai-smoke-test.md), [docs/live-integration-phase-1.md](docs/live-integration-phase-1.md), and [qa/verification-report.md](qa/verification-report.md).

Current automated coverage includes:

- Playwright E2E for dashboard, order detail, and public API smoke/regression flows
- split logic across kitchens
- ticket status derivation
- consolidated order status derivation
- mutation handler flows
- demo regression scenarios for single-kitchen, partially-ready, and fully-ready orders

## What Is Mocked

- `mock` remains the default provider mode for local development and seed scenarios
- local Phase 1 QA against the real `anota_ai` adapter is documented in [qa/verification-report.md](qa/verification-report.md)
- live tenant credential ownership, provider-delivered webhooks, scheduler cadence, and pilot operator runbooks remain operator-side follow-up items tracked in [qa/live-integration-post-qa-checklist.md](qa/live-integration-post-qa-checklist.md)
- individual user accounts, manager overrides, and credential-management UI are not implemented
- real-time transport is not implemented; polling via TanStack Query is used for kitchen and salão synchronization

In Phase 1 live mode, unmapped provider items are **not skipped**. Missing provider catalog `externalID` or missing local kitchen mapping blocks the entire order and opens a `missing_mapping` exception.

## Idea Artifact

The approved idea document for this MVP lives at:

[`/.compozy/tasks/bistro-production-mvp/_idea.md`](.compozy/tasks/bistro-production-mvp/_idea.md)

## Roadmap

Delivery stages and current progress are tracked in:

[`/docs/roadmap.md`](docs/roadmap.md)
