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

- `BISTRO_ANOTA_WEBHOOK_SECRET` protects `POST /api/integrations/anota-ai/webhook` through header `x-bistro-anota-webhook-secret`
- `BISTRO_INTERNAL_SYNC_SECRET` protects `POST /api/internal/sync/anota-ai` through header `x-bistro-internal-sync-secret`
- `BISTRO_ANOTA_AI_BASE_URL` is optional; the adapter defaults to `https://api-parceiros.anota.ai/partnerauth`
- `BISTRO_DATABASE_PATH` is optional and useful for isolated QA or pilot databases
- provider catalog `externalID` / `external_id` must map directly to the local `menu_item_id`
- if any live provider item has no usable local mapping, the order fails closed and opens a sync exception instead of falling back to item names

Operational docs:

- [docs/live-integration-phase-1.md](docs/live-integration-phase-1.md)
- [qa/live-integration-post-qa-checklist.md](qa/live-integration-post-qa-checklist.md)

## Local Data

The app creates a local SQLite database at:

```bash
data/bistro-production.sqlite
```

Override it with `BISTRO_DATABASE_PATH` when you need an isolated file for QA, E2E, or a live-like rehearsal.

On startup it will:

1. create tables if needed
2. seed kitchens and menu item mappings
3. in `mock` mode, import demo orders through the mock provider adapter
4. in `mock` mode, apply demo operational scenarios and demo sync exceptions for acceptance coverage

Boot behavior by provider mode:

- `mock`: seeds demo production data for local walkthroughs and acceptance coverage
- `anota_ai`: keeps only kitchens and menu mappings seeded so live or fake-provider sync can populate the board

## Routes

- `/`
  - kitchen sync board
- `/orders/[orderId]?kitchen=kitchen-1`
  - full-screen order detail focused on one kitchen
- `/salon`
  - read-only salão summary
- `/api/board`
  - production board payload
- `/api/orders/[orderId]`
  - order detail payload
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

Open:

```bash
http://localhost:3000
```

If you want to exercise the Phase 1 live adapter locally, create `.env.local` with the real-integration contract before booting the app:

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

Do not switch to `anota_ai` until the provider catalog `externalID` values match the local kitchen mapping keys and the operator secrets are provisioned.

## Validation

Run:

```bash
npm run lint
npm run test:run -- --coverage
npm run build
npm run test:e2e
```

Current automated coverage includes:

- Playwright E2E for dashboard, order detail, and public API smoke/regression flows
- split logic across kitchens
- ticket status derivation
- consolidated order status derivation
- mutation handler flows
- demo regression scenarios for single-kitchen, partially-ready, and fully-ready orders

## What Is Mocked

- `mock` remains the default provider mode for local development and seed scenarios
- live Anota AI credentials, webhook delivery, scheduler cadence, and pilot operator runbooks still require runtime verification in task 09
- internal user authentication and permissions are not implemented
- real-time transport is not implemented; polling via TanStack Query is used for kitchen and salão synchronization

In Phase 1 live mode, unmapped provider items are **not skipped**. Missing provider catalog `externalID` or missing local kitchen mapping blocks the entire order and opens a `missing_mapping` exception.

## Idea Artifact

The approved idea document for this MVP lives at:

[`/.compozy/tasks/bistro-production-mvp/_idea.md`](.compozy/tasks/bistro-production-mvp/_idea.md)

## Roadmap

Delivery stages and current progress are tracked in:

[`/docs/roadmap.md`](docs/roadmap.md)
