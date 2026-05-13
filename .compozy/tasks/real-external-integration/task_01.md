---
status: completed
title: "Define provider sync contracts and domain types"
type: backend
complexity: medium
dependencies: []
---

# Task 01: Define provider sync contracts and domain types

## Overview
Introduce the domain and application-level contracts that support real external synchronization without leaking provider-specific payloads into the kitchen production model. This task establishes the type system that all later sync, storage, route, and UI work will depend on.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST add sync-focused domain types in a dedicated module such as `src/domain/provider-sync.ts` and keep provider lifecycle or exception concepts out of `src/domain/production.ts` where possible.
2. MUST extend `src/application/ports.ts` with provider sync and repository interfaces required by the TechSpec Core Interfaces section.
3. MUST preserve compatibility with the existing production domain, mock flows, and current read-model consumers so later tasks can build incrementally.
4. SHOULD keep the contracts narrow and Phase 1 specific, avoiding speculative abstractions beyond the approved TechSpec.
</requirements>

## Subtasks
- [x] 1.1 Add sync enums, records, and input or result types required for canonical snapshot handling, sync runs, and exception lifecycle.
- [x] 1.2 Extend application ports for provider sync fetches, reconciliation inputs, and exception persistence operations.
- [x] 1.3 Define any shared helper types needed by the provider adapter and sync service without coupling them to Next.js route handlers.
- [x] 1.4 Add or update pure tests for any new domain helpers or contract-level invariants introduced by this task.

## Implementation Details
Create the smallest contract surface that can support the approved `webhook-first + scheduled reconciliation` design. See TechSpec sections `Core Interfaces`, `Data Models`, and `Technical Considerations`.

### Relevant Files
- `src/application/ports.ts` — current repository and provider boundary definitions that need sync-specific extension.
- `src/domain/production.ts` — existing production types that the new sync contracts must not pollute.
- `src/application/order-sync-service.ts` — current narrow sync flow and a useful reference for preserving internal production input boundaries.
- `src/domain/split-order-service.ts` — current import boundary that later tasks will continue to call after normalization.

### Dependent Files
- `src/infrastructure/sqlite.ts` — will implement the new repository methods in task 02.
- `src/infrastructure/mock-order-provider.ts` — will adapt to the new provider interface in task 03.
- `src/application/provider-sync-service.ts` — will consume these contracts in task 04.
- `app/api/integrations/anota-ai/webhook/route.ts` — future route layer will depend on these request and result shapes.

### Related ADRs
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Defines the sync entry points that drive the contract shape.
- [ADR-005: Canonical Snapshot Sync With Dedicated SQLite Sync Tables](adrs/adr-005.md) — Requires explicit sync state and exception contracts.
- [ADR-008: Use Provider Catalog External IDs as the Canonical Menu Mapping Key](adrs/adr-008.md) — Constrains normalized item identifiers.

## Deliverables
- New or updated sync domain types and application ports aligned with the approved TechSpec.
- Backward-compatible type updates for existing sync and production boundaries.
- Unit tests covering any new pure helpers or contract-level invariants.
- Integration-oriented compile or repository contract checks for the updated ports **(REQUIRED)**.
- Unit tests with 80%+ coverage **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Sync exception status values expose `open`, `acknowledged`, and `resolved` without regressions.
  - [x] Provider lifecycle or trigger helper logic returns the expected enum values for valid inputs.
  - [x] Contract-level helper types reject invalid or missing provider identifiers where applicable.
- Integration tests:
  - [x] Existing production-service and split-order tests still compile and pass against the updated ports.
  - [x] Mock provider contracts remain usable by downstream repository or service tests after the interface expansion.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Sync contracts exist in dedicated modules and match the approved TechSpec surface.
- Existing production code continues to compile without leaking provider-specific semantics into kitchen domain models.
