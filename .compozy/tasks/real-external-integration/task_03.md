---
status: completed
title: "Implement provider adapter selection and Anota canonical snapshot adapter"
type: backend
complexity: high
dependencies:
  - task_01
---

# Task 03: Implement provider adapter selection and Anota canonical snapshot adapter

## Overview
Add the infrastructure boundary that can operate in either mock mode or real Anota AI mode, while normalizing provider data into the internal canonical snapshot and production input shape. This task keeps provider-specific fields isolated and makes catalog `externalID` the only accepted bridge into local kitchen mappings.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST implement an Anota AI adapter that can fetch canonical order snapshots and list confirmed orders through the new provider sync port.
2. MUST add a provider factory or equivalent selection mechanism so local demo or test flows can continue using the mock provider by configuration.
3. MUST derive the provider routing key from provider catalog `externalID` and MUST NOT fall back to name-based matching in Phase 1.
4. MUST isolate provider-specific auth headers, URL construction, and payload mapping inside infrastructure code rather than application or UI layers.
</requirements>

## Subtasks
- [x] 3.1 Create the Anota AI provider adapter with canonical fetch and confirmed-order listing methods.
- [x] 3.2 Implement normalization from Anota payloads into `ProviderOrderSnapshot` and `RawProviderOrderInput`.
- [x] 3.3 Add a provider selection mechanism that supports `mock` and `anota_ai` modes by environment or configuration.
- [x] 3.4 Update the mock provider to satisfy any expanded provider interface needs for tests and local fallback flows.
- [x] 3.5 Add adapter tests for lifecycle mapping, `externalID` extraction, and unsupported payload handling.

## Implementation Details
Keep HTTP specifics inside infrastructure and avoid broad shared abstractions. See TechSpec sections `Component Overview`, `Integration Points`, `Data Models`, and `Technical Dependencies`.

### Relevant Files
- `src/infrastructure/mock-order-provider.ts` — current provider implementation and compatibility baseline.
- `src/application/ports.ts` — target provider sync interface.
- `src/domain/production.ts` — destination shape for normalized production input after canonical translation.
- `README.md` — existing mock integration documentation and environment guidance that this task will later influence.

### Dependent Files
- `src/application/provider-sync-service.ts` — will call this adapter in task 04.
- `app/api/integrations/anota-ai/webhook/route.ts` — will instantiate or consume provider selection in task 05.
- `app/api/internal/sync/anota-ai/route.ts` — will run reconciliation through the same adapter in task 05.
- `src/infrastructure/sqlite.ts` — will persist normalized provider order state from this adapter’s outputs.

### Related ADRs
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Defines the entry points this adapter must serve.
- [ADR-007: Shared Secret Authentication for Sync Entry Points](adrs/adr-007.md) — Constrains route-side auth expectations that the adapter should not own.
- [ADR-008: Use Provider Catalog External IDs as the Canonical Menu Mapping Key](adrs/adr-008.md) — Directly constrains item normalization.

## Deliverables
- An Anota AI provider adapter that fetches canonical snapshots and confirmed-order lists through the approved port.
- A provider selection mechanism that keeps mock mode available for local development and automated tests.
- Updated mock provider compatibility where needed.
- Unit tests covering lifecycle mapping, normalization, and `externalID` extraction.
- Integration tests covering provider selection and adapter-level unsupported payload behavior **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Anota payload normalization maps provider status into the expected Phase 1 lifecycle values.
  - [x] Item normalization uses catalog `externalID` as `menuItemId` and rejects missing identifiers.
  - [x] Mock and Anota provider selection returns the expected implementation for each configured mode.
- Integration tests:
  - [x] Adapter fetch methods return normalized snapshots that downstream sync code can consume.
  - [x] Unsupported or incomplete provider payloads surface descriptive failures without mutating production input types.
  - [x] Existing mock-based flows still function after interface expansion.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Real provider infrastructure is available behind an internal adapter boundary without breaking mock flows.
- Provider catalog `externalID` is the only accepted menu mapping key in normalized inputs.
