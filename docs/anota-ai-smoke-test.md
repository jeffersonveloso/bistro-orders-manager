# Anota AI Smoke Test Guide

This guide is the practical runtime checklist for validating the Phase 1 Anota AI integration against a live or mock-compatible provider endpoint.

Use it after the app is already implemented in `anota_ai` mode and before treating the integration as operationally verified in a pilot environment.

Repository QA status:

- Stage 5 local QA was closed on `2026-05-13` against the real `anota_ai` adapter boundary using a fake provider over HTTP.
- The repository browser regression suite `npm run test:e2e` is separate from this guide and intentionally forces `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock`.
- Treat this smoke test as pilot/runtime validation, not as a substitute for the seeded Playwright regression suite.

## Goal

Validate the real sync path end to end:

- provider token works
- confirmed orders can be imported
- the board splits items by kitchen correctly
- webhook and reconciliation behave as expected
- exceptions open and remain visible with the approved Phase 1 lifecycle

## Preconditions

Before running the smoke test:

1. The Anota AI catalog must expose `externalID` or `external_id` values for every item used in the test.
2. Those values must be bound in the local mapping table as provider keys before the run. In the current Operational Hardening release, `/catalog` is blocked for kitchen and salão sessions, so load them through explicit data work or a future admin surface. The local `menu_item_id` can be a different internal UUID.
3. You must have:
   - a provider token
   - a webhook secret
   - an internal reconciliation secret
4. You should use an isolated SQLite file for the test run.

If the provider keys are not linked in the local mapping table, the app will fail closed and open `missing_mapping` instead of importing the order.

## Local Menu Mapping Keys

At minimum, prepare provider-linked test items that map to both kitchens:

- `kitchen-1`
  - `iced-coffee`
  - `orange-juice`
  - `cappuccino`
  - `hibiscus-iced-tea`
  - `sparkling-water`
- `kitchen-2`
  - `croissant`
  - `quiche-lorraine`
  - `pain-au-chocolat`
  - `brownie`
  - `ham-cheese-toast`

## Environment Setup

Create `.env.local` with a dedicated test database:

```bash
BISTRO_ORDER_SYNC_PROVIDER_MODE=anota_ai
BISTRO_ANOTA_AI_TOKEN=replace-me
BISTRO_ANOTA_WEBHOOK_SECRET=replace-me
BISTRO_INTERNAL_SYNC_SECRET=replace-me
BISTRO_ANOTA_AI_BASE_URL=https://api-parceiros.anota.ai/partnerauth
BISTRO_ANOTA_AI_CATALOG_BASE_URL=https://api-menu.anota.ai/partnerauth
BISTRO_ANOTA_AI_CATALOG_LIST_PATH=v2/nm-category/rest/simple-item/export/v2
BISTRO_DATABASE_PATH=data/bistro-production.live.sqlite
```

Do not run this against your default local demo database if you want clean evidence.

If `.env.local` is left in `anota_ai` mode after this smoke test, the repository Playwright suite still remains safe to run because its web server overrides the provider mode back to `mock`.

## Step 1: Validate Provider Access

Before booting the app, confirm the provider token can reach the Anota list endpoint:

```bash
set -a
source .env.local
set +a

curl -sS "$BISTRO_ANOTA_AI_BASE_URL/ping/list?currentpage=1" \
  -H "Authorization: $BISTRO_ANOTA_AI_TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json'
```

Expected result:

- JSON response
- no authentication error
- no transport error

If this fails, stop here and fix token or base URL issues first.

Optional catalog validation before boot:

```bash
curl -sS "$BISTRO_ANOTA_AI_CATALOG_BASE_URL/$BISTRO_ANOTA_AI_CATALOG_LIST_PATH" \
  -H "Authorization: $BISTRO_ANOTA_AI_TOKEN" \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json'
```

Expected result:

- JSON response with the provider catalog export
- category objects containing nested item arrays such as `itens`
- no authentication error

## Step 2: Start the App

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Expected result in `anota_ai` mode:

- the app boots successfully
- the board contains only the seeded kitchens by default
- mappings may be empty until they are inserted explicitly or loaded through a future admin surface
- there are no demo provider orders unless live sync imports them

## Step 3: Create Or Identify a Confirmed Provider Order

Use a simple test order with items from both kitchens, for example:

- `iced-coffee`
- `croissant`

Record the external order ID from Anota AI. The internal order ID will be:

```text
order_<ANOTA_ORDER_ID>
```

## Step 4: Run Manual Reconciliation First

Use reconciliation before webhook testing to reduce variables.

```bash
curl -sS -X POST http://localhost:3000/api/internal/sync/anota-ai \
  -H 'Content-Type: application/json' \
  -H "x-bistro-internal-sync-secret: $BISTRO_INTERNAL_SYNC_SECRET" \
  --data '{"externalOrderId":"ANOTA_ORDER_ID"}'
```

Expected result:

- HTTP `200`
- a sync summary payload
- the order appears in the board

## Step 5: Validate Board And Order APIs

Check the board:

```bash
curl -sS http://localhost:3000/api/board
```

Check order detail:

```bash
curl -sS "http://localhost:3000/api/orders/order_ANOTA_ORDER_ID?kitchen=kitchen-1"
```

Expected result:

- the imported order is present
- `kitchen-1` sees only its items
- the detail view shows the other kitchen separately
- there is no `syncException` in the happy path

## Step 6: Simulate Webhook Intake Locally

Your webhook route only needs a minimal envelope because the app fetches the canonical order snapshot after journaling the event.

```bash
curl -sS -X POST http://localhost:3000/api/integrations/anota-ai/webhook \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BISTRO_ANOTA_WEBHOOK_SECRET" \
  --data '{"eventType":"order.updated","deliveryKey":"manual-001","externalOrderId":"ANOTA_ORDER_ID"}'
```

Expected result:

- HTTP `200` for terminal business outcomes
- no duplicate internal order creation
- already imported orders are ignored or refreshed according to the sync result

## Step 7: Validate Real Webhook Delivery

To test provider-originated webhooks:

1. expose the app through a public HTTPS URL
2. configure the provider webhook target to:

```text
POST /api/integrations/anota-ai/webhook
```

3. configure the provider-side secret to match `BISTRO_ANOTA_WEBHOOK_SECRET`
4. send the secret in `Authorization: Bearer <secret>` when simulating the webhook locally
4. create or update a real provider order

Expected result:

- the provider hits the webhook endpoint successfully
- the order is imported without manual reconciliation

## Step 8: Validate Critical Exception Flows

### Missing Mapping

Create a provider order with an item whose `externalID` does not exist in the local kitchen mappings.

Expected result:

- the order does not enter the board
- a `missing_mapping` exception is opened

### Changed Externally

After import, change one of these in the provider:

- item quantity
- production-affecting note
- modifier set

Then trigger webhook or reconciliation again.

Expected result:

- the imported production order remains unchanged
- a `changed_externally` exception is opened or refreshed

### Canceled Externally

After import, cancel the provider order and trigger webhook or reconciliation again.

Expected result:

- the imported production order remains unchanged
- a `canceled_externally` exception is opened or refreshed

## Step 9: Validate Salão Acknowledge

Get the current unresolved exception from the order detail response:

```bash
curl -sS "http://localhost:3000/api/orders/order_ANOTA_ORDER_ID?kitchen=kitchen-1"
```

Then acknowledge it:

```bash
curl -sS -X POST \
  "http://localhost:3000/api/orders/order_ANOTA_ORDER_ID/sync-exceptions/EXCEPTION_ID/acknowledge" \
  -H 'Content-Type: application/json' \
  --data '{"resolutionNote":"checked by salon"}'
```

Expected result:

- response status becomes `acknowledged`
- the exception remains visible until replay or reconciliation resolves the underlying condition

## Step 10: Inspect SQLite Evidence

If `sqlite3` is available, inspect sync evidence directly.

Provider events:

```bash
sqlite3 data/bistro-production.live.sqlite \
  "select provider, delivery_key, process_status, error_code, error_message from provider_events order by received_at desc limit 20;"
```

Sync runs:

```bash
sqlite3 data/bistro-production.live.sqlite \
  "select provider, trigger, status, imported_count, ignored_count, exception_count, error_count from sync_runs order by started_at desc limit 20;"
```

Provider order state:

```bash
sqlite3 data/bistro-production.live.sqlite \
  "select provider, external_order_id, lifecycle, imported_order_id from provider_orders order by last_seen_at desc limit 20;"
```

Exceptions:

```bash
sqlite3 data/bistro-production.live.sqlite \
  "select kind, status, external_order_id, order_id, detected_at, acknowledged_at, resolved_at from order_sync_exceptions order by detected_at desc limit 20;"
```

## Recommended Test Order

Run the checks in this order:

1. provider token and base URL
2. app boot in `anota_ai` mode
3. manual reconciliation for one confirmed order
4. local board and detail API verification
5. local webhook simulation
6. real provider webhook delivery through a public URL
7. `missing_mapping`
8. `changed_externally`
9. `canceled_externally`
10. salão `acknowledge`

## Stoplight Mock Limitation

The Stoplight mock used during development was enough to confirm:

- `Authorization` is required
- `/ping/list` responds

It was **not** sufficient to validate the full sync flow because the canonical detail endpoint returned an empty body:

- `GET /ping/get/:id` returned HTTP `200` with no JSON body

Since the app depends on canonical snapshot fetch for real apply logic, treat the Stoplight mock as a partial contract check only, not as proof that Phase 1 works end to end.

Mock base used during development:

```text
https://stoplight.io/mocks/anota-ai/api-de-pedidos/444207731
```

## Useful References

- [Phase 1 Live Integration Playbook](./live-integration-phase-1.md)
- [Roadmap](./roadmap.md)
- [README](../README.md)
- [Anota AI Integration Portal](https://anota-ai.stoplight.io/docs/api-de-pedidos/udio7jx7jg0dz-portal-de-integracao)
- [Anota AI Order List](https://anota-ai.stoplight.io/docs/api-de-pedidos/ffajlzye2twz2-consulta-de-pedidos)
- [Anota AI Order Detail](https://anota-ai.stoplight.io/docs/api-de-pedidos/hocabe2egox32-consultar-informacoes-do-pedido)
- [Anota AI Catalog externalID Guide](https://anota-ai.stoplight.io/docs/api-de-pedidos/tq89e14cjq8f5-inserindo-os-external-id-no-cardapio-da-anota-ai)
