# Phase 1 Live Integration Playbook

This document is the maintainer and operator baseline for the Phase 1 Anota AI rollout. It describes the contract that is already implemented in the repository, the scope boundaries that remain intentional, and the runtime assumptions that task 09 must verify with fresh evidence.

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

| Variable | When it matters | Current contract | Task 09 must verify |
| --- | --- | --- | --- |
| `BISTRO_ORDER_SYNC_PROVIDER_MODE` | Always | `mock` is the safe default. Set `anota_ai` only when the live adapter should run. | Which mode is active in the QA and pilot environments. |
| `BISTRO_ANOTA_AI_TOKEN` | `anota_ai` mode | Required. Sent to the provider as the `Authorization` header. | Token provisioning, rotation owner, and whether extra provider setup is needed. |
| `BISTRO_ANOTA_AI_BASE_URL` | `anota_ai` mode | Optional. Defaults to `https://api-parceiros.anota.ai/partnerauth`. | Whether the pilot keeps the default base URL or requires an override. |
| `BISTRO_ANOTA_WEBHOOK_SECRET` | Webhook intake | Required for `POST /api/integrations/anota-ai/webhook`. Checked against `x-bistro-anota-webhook-secret`. | Secret distribution path and the exact provider-side header wiring. |
| `BISTRO_INTERNAL_SYNC_SECRET` | Reconciliation | Required for `POST /api/internal/sync/anota-ai`. Checked against `x-bistro-internal-sync-secret`. | Which scheduler or operator surface stores and sends the secret. |
| `BISTRO_DATABASE_PATH` | Optional but operationally relevant | Overrides the default SQLite file path for isolated local, QA, or pilot runs. | Final deployment path, backup note, and filesystem permissions. |

If any live-mode prerequisite is missing, keep `BISTRO_ORDER_SYNC_PROVIDER_MODE=mock` and continue using the seeded local flow instead of partially enabling the provider integration.

## Startup And Rollout Prerequisites

Before enabling `anota_ai` mode:

1. Confirm the local menu mapping keys are the intended canonical values for production routing.
2. Populate the Anota AI catalog item `externalID` or `external_id` fields with those same keys.
3. Provision both shared secrets and confirm who owns rotation for each channel.
4. Confirm the instance can write to `BISTRO_DATABASE_PATH`.
5. Confirm an external scheduler or manual runbook exists for `POST /api/internal/sync/anota-ai`.

The scheduler cadence is intentionally **not locked in this document yet**. Task 09 must record the real cadence that was exercised during QA and confirm it is sufficient for the PRD release gates of 30s / 60s board visibility.

## Catalog Mapping Contract

The live adapter treats the provider catalog `externalID` as the canonical bridge into the local `menu_item_id`.

Required behavior:

- every imported provider item must expose a usable `externalID` or `external_id`
- that value must match an internal `menu_item_id`
- there is no Phase 1 fallback to item names, aliases, or fuzzy matching

Fail-closed behavior:

- if any item in the provider order lacks a usable catalog external ID
- or the external ID does not exist in the local kitchen mapping
- then the entire order stays out of production
- and the sync layer opens or refreshes a `missing_mapping` exception

This is deliberate. Kitchen routing should break loudly and safely, not silently guess.

## Operational Flows

### 1. Webhook Intake

Route: `POST /api/integrations/anota-ai/webhook`

Maintainer contract:

- the request must include `x-bistro-anota-webhook-secret`
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

Task 09 must confirm the actual scheduler owner, the exact cadence used in QA, and the command or service that invoked this route.

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

## Provisional Commands For Task 09 To Verify

These commands are documentation placeholders, not verified rollout evidence yet.

Manual reconciliation:

```bash
curl -X POST http://localhost:3000/api/internal/sync/anota-ai \
  -H 'Content-Type: application/json' \
  -H "x-bistro-internal-sync-secret: $BISTRO_INTERNAL_SYNC_SECRET" \
  -d '{"updatedSince":"2026-05-11T00:00:00.000Z","limit":25}'
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
  -H "x-bistro-anota-webhook-secret: $BISTRO_ANOTA_WEBHOOK_SECRET" \
  -d '{"deliveryKey":"manual-test-1","eventType":"order.confirmed","externalOrderId":"replace-me"}'
```

Task 09 must confirm the real command variants, the actual base URL / hostname used in QA, and whether the provider webhook payload shape needs any doc correction beyond the minimum envelope described here.

## Task 09 Finalization Inputs

Before task 09 closes the rollout docs, it must reconcile this playbook with:

- [qa/live-integration-post-qa-checklist.md](../qa/live-integration-post-qa-checklist.md)
- [qa/verification-report.md](../qa/verification-report.md)
- any screenshots, request logs, or scheduler evidence gathered during QA
