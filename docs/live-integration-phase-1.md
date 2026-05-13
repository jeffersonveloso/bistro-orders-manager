# Phase 1 Live Integration Playbook

This document is the maintainer and operator baseline for the Phase 1 Anota AI rollout after the Stage 5 QA closure on `2026-05-13`. It describes the contract implemented in the repository, the behaviors validated locally against the real `anota_ai` adapter boundary, and the pilot-only follow-ups that still depend on a live tenant or scheduler owner.

## Scope

Phase 1 is intentionally narrow:

- import only provider orders that are already in a production-valid confirmed state
- prefer webhook intake for latency and scheduled reconciliation for recovery
- keep the kitchen board stable after import
- surface operationally relevant exceptions instead of rewriting production rows automatically

Phase 1 does **not** cover:

- scheduled or pre-confirmation provider states
- bidirectional sync back to the provider
- automatic rewrites of imported kitchen orders after later provider changes
- name-based matching for menu routing

## Mode Selection And Environment Contract

| Variable | When it matters | Current contract | Local QA status / pilot follow-up |
| --- | --- | --- | --- |
| `BISTRO_ORDER_SYNC_PROVIDER_MODE` | Always | `mock` is the safe default. Set `anota_ai` only when the live adapter should run. | Confirmed in local QA: Phase 1 adapter tests ran in `anota_ai`; Playwright browser regression stays isolated in `mock`. |
| `BISTRO_ANOTA_AI_TOKEN` | `anota_ai` mode | Required. Sent to the provider as the `Authorization` header. | Local fake-provider QA confirmed header wiring. Live token ownership and rotation remain pilot-only follow-up. |
| `BISTRO_ANOTA_AI_BASE_URL` | `anota_ai` mode | Optional. Defaults to `https://api-parceiros.anota.ai/partnerauth`. | Local QA used an override to drive a fake provider through the real adapter. Production default remains unverified in this environment. |
| `BISTRO_ANOTA_AI_CATALOG_BASE_URL` | Catalog admin pull and publish | Optional. Defaults to `https://api-menu.anota.ai/partnerauth`. | Contract documented and code-covered. Real tenant value still depends on pilot environment access. |
| `BISTRO_ANOTA_AI_CATALOG_LIST_PATH` | Catalog admin pull | Optional. Defaults to `v2/nm-category/rest/simple-item/export/v2`. | Contract documented and code-covered. Tenant-specific divergence remains a pilot check. |
| `BISTRO_ANOTA_WEBHOOK_SECRET` | Webhook intake | Required for `POST /api/integrations/anota-ai/webhook`. Checked against `Authorization: Bearer <secret>` and also accepted in `x-bistro-anota-webhook-secret` for local/manual compatibility. | Local QA verified both the route and payload shape. Provider-side secret ownership and console wiring remain blocked without a live tenant. |
| `BISTRO_INTERNAL_SYNC_SECRET` | Reconciliation | Required for `POST /api/internal/sync/anota-ai`. Checked against `x-bistro-internal-sync-secret`. | Local QA verified the route and replay bodies. Scheduler ownership and secret rotation remain pilot-only follow-up. |
| `BISTRO_DATABASE_PATH` | Optional but operationally relevant | Overrides the default SQLite file path for isolated local, QA, or pilot runs. | Verified locally with isolated QA and E2E databases. Final deployment path and backup policy remain operational decisions. |

If any live-mode prerequisite is missing, keep `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock` and continue using the seeded local flow instead of partially enabling the provider integration.

Runtime bootstrap behavior:

- `mock` mode boots with seeded demo orders, demo operational progress, and demo sync exceptions for local walkthroughs.
- `anota_ai` mode boots a fresh production board on a new SQLite file and keeps only kitchens seeded.
- `npm run test:e2e` explicitly forces `mock` mode inside Playwright so seeded browser regression does not inherit a live-oriented `.env.local`.

## Startup And Rollout Prerequisites

Before enabling `anota_ai` mode:

1. Confirm the local menu mappings exist for the items that should route into production.
   In the current Operational Hardening matrix, `/catalog` and `/api/catalog/*` are blocked for `kitchen-1`, `kitchen-2`, and `salon`, so create those bindings through an explicit data load or a future admin surface. They are no longer seeded from a JSON fixture in live mode.
2. Populate the Anota AI catalog item `externalID` or `external_id` fields with values that are bound in those mappings.
3. Provision both shared secrets and confirm who owns rotation for each channel.
4. Confirm the instance can write to `BISTRO_DATABASE_PATH`.
5. Confirm an external scheduler or manual runbook exists for `POST /api/internal/sync/anota-ai`.

Repository QA validated the reconciliation HTTP surface and targeted replay commands locally. A real scheduler cadence, owner, and production invocation path remain pilot-only follow-up because no scheduler service was available in this repository environment.

## Catalog Mapping Contract

The live adapter treats the provider catalog `externalID` as the canonical provider-side routing key, but the local `menu_item_id` remains the Bistro-owned identifier. When known, the mapping also stores the provider internal catalog item id separately as `provider_item_id`.

Required behavior:

- every imported provider item must expose either a usable `externalID` / `external_id` or a previously bound provider catalog item id
- the preferred routing key is `menu_item_kitchen_mappings.provider_external_id`
- when the provider omits `externalID` on the order line but still sends the catalog item id, the sync may fall back to `menu_item_kitchen_mappings.provider_item_id`
- there is no Phase 1 fallback to item names, aliases, or fuzzy matching

Fail-closed behavior:

- if any item in the provider order lacks a usable catalog external ID
- or the external ID does not exist in the local kitchen mapping
- then the entire order stays out of production
- and the sync layer opens or refreshes a `missing_mapping` exception

This is deliberate. Kitchen routing should break loudly and safely, not silently guess.

Assisted recovery for missing provider external IDs:

- the planned UUID-draft recovery still exists at the integration-contract level, but it is not exposed to current operational area sessions
- the system still expects a Bistro-owned UUID or equivalent provider key to be stored as the planned `menu_item_id` plus `provider_external_id`
- when the provider exposes a validated `api_write` capability and the `provider_item_id` is known, a future admin or manual review flow may publish that same value automatically
- for Anota AI, Phase 1 uses `PUT https://api-menu.anota.ai/partnerauth/v2/item/external-id/{item_id}` with the same provider token
- the catalog pull reads the Anota menu export by categories through `GET https://api-menu.anota.ai/partnerauth/v2/nm-category/rest/simple-item/export/v2`
- if the publish call fails, the generated value still needs a manual reconciliation path outside the current operational area UI

## Operational Flows

### 1. Webhook Intake

Route: `POST /api/integrations/anota-ai/webhook`

Maintainer contract:

- the request must include `Authorization: Bearer <secret>` or, for local/manual compatibility, `x-bistro-anota-webhook-secret`
- the minimum usable envelope is `deliveryKey` plus `eventType`
- `externalOrderId` may be absent; in that case the system still records a replayable `ingestion_failed` exception instead of short-circuiting earlier

Runtime behavior:

1. authenticate the shared secret before side effects
2. persist the inbound event
3. start a sync run
4. fetch the canonical provider snapshot
5. apply duplicate protection, import, or exception logic
6. mark the event and sync run as processed or failed

### 2. Scheduled Reconciliation And Manual Replay

Route: `POST /api/internal/sync/anota-ai`

Maintainer contract:

- the request must include `x-bistro-internal-sync-secret`
- an empty JSON object is allowed
- optional fields are `externalOrderId`, `updatedSince`, and `limit`
- the route reuses the same application service as webhook intake

Operational intent:

- the webhook path is the fast path
- reconciliation is the safety net for lost, delayed, or replayed provider events
- manual replay should target a specific `externalOrderId` whenever the failure scope is narrow

Local QA confirmed the route contract, accepted headers, replay body variants, and list-based reconciliation behavior. The actual scheduler owner, cadence, and production trigger still depend on pilot deployment access.

### 3. Exception Acknowledgement

Route: `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`

Operator contract:

- this route is used by the salão surface and does not require live provider credentials
- it transitions an unresolved exception from `open` to `acknowledged`
- it does **not** resolve the exception
- a resolved exception disappears only after reconciliation or a successful replay closes the underlying condition

## Exception Ownership And Lifecycle

Exception lifecycle:

- `open`: requires attention and remains visible in board, detail, or salão surfaces
- `acknowledged`: salão or atendimento has seen it, but it remains operationally visible
- `resolved`: removed from unresolved alerts after sync success or reconciliation closes the condition

Operational ownership:

- Kitchen 1 and Kitchen 2:
  - use the board and detail view as the production source of truth
  - do not rewrite imported orders locally because of provider deltas
- Atendimento or salão:
  - primary owner for provider-side reconciliation in Phase 1
  - acknowledge order-linked exceptions from `/salon`
  - coordinate the corrective action outside the kitchen workflow
- Maintainer or operations owner:
  - manage provider mode, token, secrets, scheduler, and catalog hygiene
  - inspect sync failures that are not solvable from the salão flow alone

Exception kinds currently implemented:

- `missing_mapping`
- `changed_externally`
- `canceled_externally`
- `ingestion_failed`

## Phase 1 Fallback And Safety Rules

- If live prerequisites are unavailable, stay in `mock` mode.
- If the provider snapshot changes after import in an operationally relevant way, keep the imported production order stable and open a visible exception.
- If the provider snapshot returns to a production-valid baseline later, reconciliation may resolve the exception.
- If a duplicate delivery arrives for the same external order, the sync layer must ignore the duplicate instead of creating a second production order.

## Validated Local QA Commands

Local QA on `2026-05-13` confirmed these command shapes against the implemented routes. Replace hostnames, secrets, and IDs for the pilot environment as needed.

Manual reconciliation:

```bash
curl -X POST http://localhost:3000/api/internal/sync/anota-ai \
  -H 'Content-Type: application/json' \
  -H "x-bistro-internal-sync-secret: $BISTRO_INTERNAL_SYNC_SECRET" \
  -d '{"updatedSince":"2000-01-01T00:00:00.000Z","limit":25}'
```

Targeted replay:

```bash
curl -X POST http://localhost:3000/api/internal/sync/anota-ai \
  -H 'Content-Type: application/json' \
  -H "x-bistro-internal-sync-secret: $BISTRO_INTERNAL_SYNC_SECRET" \
  -d '{"externalOrderId":"replace-me"}'
```

Webhook simulation:

```bash
curl -X POST http://localhost:3000/api/integrations/anota-ai/webhook \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BISTRO_ANOTA_WEBHOOK_SECRET" \
  -d '{"deliveryKey":"manual-test-1","eventType":"order.confirmed","externalOrderId":"replace-me"}'
```

Validated local QA details:

- manual reconciliation accepted both `externalOrderId` replays and list-based bodies with `updatedSince` plus `limit`
- webhook simulation accepted the minimal envelope `deliveryKey`, `eventType`, and `externalOrderId`
- local QA used `http://127.0.0.1:3100` with shared-secret headers and a fake provider wired through the real adapter

Pilot-only follow-up:

- real public hostname
- provider-delivered webhook proof
- production scheduler owner and cadence

## Post-QA Evidence

This playbook is reconciled against:

- [qa/live-integration-post-qa-checklist.md](../qa/live-integration-post-qa-checklist.md)
- [qa/verification-report.md](../qa/verification-report.md)
- the request/response evidence under [qa/evidence](../qa/evidence)
- the browser screenshots under [qa/screenshots](../qa/screenshots)
