---
status: completed
title: "Surface sync exceptions in board, order detail, and salão flows"
type: frontend
complexity: high
dependencies:
  - task_02
  - task_04
  - task_05
---

# Task 06: Surface sync exceptions in board, order detail, and salão flows

## Overview
Expose Phase 1 sync visibility in the existing operator surfaces without changing kitchen production status semantics. This task extends the read models and UI so staff can see board-level alerts, order-level exception markers, minimal sync trail information, and the new salão acknowledgment action.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST extend production read models so `GET /api/board` and `GET /api/orders/[orderId]` can expose open sync exception state and minimal sync trail data.
2. MUST keep kitchen status derivation unchanged while adding sync exception markers and alert presentation.
3. MUST add a minimal salão-side acknowledgment action for open exceptions using the new route contract from task 05.
4. SHOULD preserve the existing large-format kitchen UX and polling model while adding the smallest viable exception visibility affordances.
</requirements>

## Subtasks
- [x] 6.1 Extend board and order detail read models with sync exception fields and any summary metrics required by the TechSpec.
- [x] 6.2 Add board-level sync alert presentation and per-ticket exception markers to the kitchen dashboard.
- [x] 6.3 Add order detail exception banner and minimal sync trail rendering without displacing core kitchen actions.
- [x] 6.4 Add salão exception visibility and acknowledgment interaction using the new API route.
- [x] 6.5 Add or update UI-facing tests for read-model output, exception rendering, and acknowledgment invalidation behavior.

## Implementation Details
Preserve the current polling-based synchronization model and build on existing query invalidation patterns. See TechSpec sections `Data Models`, `API Endpoints`, `Impact Analysis`, and `Monitoring and Observability`.

### Relevant Files
- `src/application/production-service.ts` — current board, salão, and order detail read models that need sync exception enrichment.
- `src/application/production-service.test.ts` — current read-model test patterns.
- `src/components/kds/dashboard-client.tsx` — primary board surface for alert strip and per-card markers.
- `src/components/kds/order-detail-client.tsx` — full-screen detail surface for sync trail and exception banner.
- `src/components/kds/salon-client.tsx` — read-only salão surface that gains a minimal acknowledgment action.
- `src/lib/fetch-json.ts` — shared fetch helper for the new acknowledgment request path.

### Dependent Files
- `app/api/board/route.ts` — returns the enriched board payload used here.
- `app/api/orders/[orderId]/route.ts` — returns enriched order detail payload used here.
- `app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts` — receives the new salão action.
- `e2e/dashboard-smoke.spec.ts` — likely needs updates for visible sync markers.
- `e2e/order-detail.spec.ts` — likely needs updates for sync trail and exception banner coverage.

### Related ADRs
- [ADR-002: Signal External Order Changes Without Rewriting the Kitchen Board](adrs/adr-002.md) — Constrains how divergence appears in UI.
- [ADR-003: Alert Only on Operationally Relevant External Changes and Route Resolution to Atendimento](adrs/adr-003.md) — Defines operator ownership and alert scope.
- [ADR-005: Canonical Snapshot Sync With Dedicated SQLite Sync Tables](adrs/adr-005.md) — Supplies the queryable sync metadata this task surfaces.

## Deliverables
- Extended board, order detail, and salão payload handling with sync exception metadata.
- UI updates for alert strip, per-order markers, minimal sync trail, and salão acknowledgment.
- Tests covering read-model enrichment, rendering of open and acknowledged states, and acknowledgment invalidation behavior.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for UI-to-API exception visibility flows **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Board read-model output includes open sync exception labels without changing ticket status labels.
  - [x] Order detail read-model output includes sync trail and current exception summary when an exception exists.
  - [x] Salão presentation keeps acknowledged exceptions visible until reconciliation resolves them.
- Integration tests:
  - [x] Dashboard renders a visible marker for a ticket linked to an open sync exception.
  - [x] Order detail renders the sync trail for an imported order with `changed_externally`.
  - [x] Salão acknowledgment calls the new route and refreshes board or detail queries without clearing unresolved exceptions.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Kitchen and salão users can identify sync exceptions from the existing surfaces without losing the current production flow.
- Acknowledged exceptions remain visible until later replay or reconciliation resolves them.
