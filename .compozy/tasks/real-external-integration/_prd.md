# Real External Integration PRD

## Overview

Real External Integration brings confirmed live orders from Anota AI into the existing Vó Ziluca production workflow without manual relay. It is for Kitchen 1, Kitchen 2, and the operating staff who currently depend on retyping, checking multiple screens, or verbally passing orders. Its value is straightforward: the kitchen board becomes the trusted operational entry point for real customer demand while preserving the current split-by-kitchen workflow.

Phase 1 imports only confirmed orders that are ready for production; scheduled and pre-confirmation states are out of scope.

## Goals

- Eliminate manual relay of newly confirmed orders into the production board for the first live provider rollout.
- Make confirmed external orders visible to both kitchens quickly enough that staff do not need to monitor the provider panel in parallel.
- Prevent duplicate production orders from the same external order.
- Make ingestion failures and post-import external changes visible in the operating surfaces where staff already work.
- Preserve trust in the kitchen board as the primary production surface during live operation.

## User Stories

- As a kitchen operator, I want confirmed live orders to appear automatically in the board so I can start work without waiting for atendimento to pass the order.
- As a kitchen operator, I want the board to remain stable after an order is imported so I am not surprised by silent external changes during production.
- As an atendimento or floor staff member, I want to be clearly responsible for resolving provider-side order exceptions so the kitchen can stay focused on execution.
- As an atendimento or floor staff member, I want to know when an order failed to enter production or changed externally so I can intervene before the customer is impacted.
- As an expediter or coordinator, I want to see which imported orders now need human reconciliation so I can coordinate handoff safely.
- As an operations lead, I want the first live integration to reduce missed and duplicated orders without forcing a broad workflow change.

## Core Features

- Confirmed Order Intake: Automatically bring only confirmed orders that are ready for production into the board.
- Duplicate Protection: Ensure one external order results in one production order, even if the external system retries or repeats delivery.
- Ingestion Failure Visibility: Show a visible board-level operational alert when an expected order does not enter the board successfully.
- External Change Exception Handling: If an already imported order changes in the provider, keep the kitchen board stable and mark the affected order as requiring attention instead of rewriting it automatically.
- Relevant Change Filtering: In Phase 1, alerts are raised only for operationally relevant external changes:
  - provider-side cancellation of an imported order
  - item addition or removal after import
  - quantity change after import
  - production-affecting note or modifier change after import
- Order-Level Exception Marker: Every affected order must show a persistent marker such as `Changed externally` until the exception is resolved.
- Minimal Sync Trail: Staff must be able to inspect a lightweight history of sync-relevant events for that order so they can confirm what happened without leaving the product.
- Existing Workflow Preservation: Keep the current kitchen split, status flow, detail view, and salão summary behavior intact for imported live orders.

## User Experience

- The primary journey starts when a confirmed external order appears automatically in the production board with the same kitchen-first experience the team already knows.
- Kitchen users should not need to leave the board or cross-check the provider panel during normal happy-path intake.
- When ingestion fails, the product should surface an obvious operational alert on the board rather than forcing staff to infer that an order is missing.
- When a provider-side change affects an already imported order, the board should show a persistent per-order exception marker and expose a minimal sync trail for quick verification.
- Atendimento or salão is the primary owner of reconciliation for external-order exceptions; the kitchen is informed by the board state but does not own provider-side resolution.
- The first release should feel simpler than the current manual process, not more complete but harder to trust.

## High-Level Technical Constraints

- The first live integration must use Anota AI as the external source while preserving the current internal production workflow.
- The product must keep provider-specific behavior from changing the meaning of kitchen statuses and consolidated readiness.
- Order visibility must be fast enough for real service, especially during active kitchen periods.
- The rollout must support operational traceability for missing, repeated, or changed orders from a user point of view.

## Non-Goals (Out of Scope)

- Full bidirectional synchronization with the provider in the first release.
- Automatic rewriting of imported kitchen orders based on later provider-side changes.
- Broad coverage of every upstream provider state before order confirmation.
- A general order-management console for atendimento, managers, or finance.
- New back-office modules such as analytics, menu administration, or staff permissions.

## Phased Rollout Plan

### MVP (Phase 1)

- Import confirmed external orders automatically into production.
- Prevent duplicates.
- Show ingestion failures on the board.
- Flag operationally relevant post-import external changes without auto-applying them.
- Show a per-order exception marker and minimal sync trail.
- Route exception resolution to atendimento or salão.
- Success criteria: the kitchen can rely on the board for new confirmed orders and staff can detect and reconcile exceptions without parallel manual relay.

### Phase 2

- Expand exception handling for scheduled orders and a broader set of provider-side changes.
- Add clearer operational resolution flows for divergence cases.
- Success criteria: exception handling becomes routine instead of ad hoc.

### Phase 3

- Consider broader provider lifecycle coverage and future provider expansion once the first live flow is stable.
- Reassess whether limited bidirectional status coordination creates enough business value to justify added complexity.
- Success criteria: the integration supports a wider operational surface without reducing kitchen trust.

## Success Metrics

### Release Gates

- 99% of confirmed external orders appear in the production board within 60 seconds of becoming production-ready.
- 95% of confirmed external orders appear in the production board within 30 seconds of becoming production-ready.
- 100% of repeated deliveries for the same confirmed external order create only one production order.
- 100% of ingestion failures are surfaced through a visible operational alert in the product.
- 100% of operationally relevant post-import external changes create a visible per-order exception marker and sync trail entry.
- 0 imported orders are silently rewritten in the kitchen board because of later provider-side changes.

### Pilot KPIs

- Fewer than 5% of confirmed external orders require manual relay into kitchen production.
- At least 90% of confirmed external orders begin kitchen work from the production board without parallel provider-panel checking or verbal repasse.
- Fewer than 2% of confirmed external orders remain in an unresolved external-exception state beyond one active service cycle.
- Duplicate production orders caused by provider retries remain at 0 during the pilot window.

## Risks and Mitigations

- Adoption risk: staff may keep checking the provider surface out of habit.
- Mitigation: keep the first release narrow and make happy-path intake fully automatic.
- Trust risk: false positives or noisy alerts could make staff ignore real exceptions.
- Mitigation: alert only on operationally relevant changes defined in this PRD.
- Expectation risk: stakeholders may assume the first release covers every external order scenario.
- Mitigation: position the release as confirmed-order intake with controlled exceptions, not full provider parity.
- Process risk: exception handling may still be ambiguous if ownership is unclear.
- Mitigation: Phase 1 assigns primary reconciliation ownership to atendimento or salão.
- Alert-fatigue risk: too many irrelevant provider deltas could pollute the board.
- Mitigation: suppress non-operational changes and surface only deltas that change production or customer handoff.

## Architecture Decision Records

- [ADR-001: Controlled Confirmed-Order Ingestion for Real External Integration](adrs/adr-001.md) — Limits the first live release to confirmed-order intake, duplicate protection, and failure visibility.
- [ADR-002: Signal External Order Changes Without Rewriting the Kitchen Board](adrs/adr-002.md) — Keeps imported production orders stable and treats later provider changes as visible exceptions.
- [ADR-003: Alert Only on Operationally Relevant External Changes and Route Resolution to Atendimento](adrs/adr-003.md) — Narrows Phase 1 alerts to meaningful deltas and assigns reconciliation ownership outside the kitchen.

## Open Questions

- None blocking for the Phase 1 product scope.
- Rollout-only follow-ups can be handled in the TechSpec or launch checklist, such as pilot duration, staffing coverage during the pilot window, and escalation contacts.
