# Operational Hardening PRD

## Overview

Operational Hardening is the first access-control slice of Stage 6 for Vó Ziluca. It is for Kitchen 1, Kitchen 2, and salão staff who already rely on the production board, order detail view, and salão summary. Its purpose is narrow and practical: prevent the wrong area from changing production, especially salão staff changing kitchen work by mistake, while keeping the current workflow fast enough for a live service environment.

## Goals

- Prevent salão from changing kitchen production.
- Ensure each kitchen can act only on its own production lane.
- Add area-based authentication without slowing down shift startup.
- Preserve trust in the current kitchen board as the main operational surface.
- Keep salão responsible for monitoring and sync-exception acknowledgement, not production control.

## User Stories

- As a Kitchen 1 operator, I want to enter through a Kitchen 1 access point so I only see and act on Kitchen 1 work.
- As a Kitchen 2 operator, I want the same boundary for Kitchen 2 so I do not accidentally change the other kitchen’s flow.
- As a salão operator, I want to follow order progress and acknowledge sync exceptions without having access to production actions.
- As an operations lead, I want the system to block cross-area mistakes so the service does not depend on verbal reminders or discipline alone.

## Core Features

- Area PIN Access: The product offers separate authenticated entry points for Kitchen 1, Kitchen 2, and salão.
- Area-Specific Surfaces: After entry, each area lands in its own operational surface instead of a shared unrestricted workspace.
- Kitchen-Scoped Actions: Kitchen users can start, advance, and complete only the production work assigned to their own kitchen.
- Salão Monitoring Surface: Salão can see consolidated order progress and exception state without access to production mutations.
- Exception Acknowledgement for Salão: Salão retains the ability to acknowledge sync exceptions that require front-of-house awareness.
- Server-Enforced Authorization: All protected reads and mutations must be enforced by the server against the active area session, not only hidden or disabled in the interface.
- Clear Access Denial Feedback: If a user attempts to reach a blocked action or surface, the system must explain that the action is not available in that area.

## User Experience

- At shift start, the operator chooses the correct area and enters that area’s PIN.
- A kitchen operator reaches a focused production surface with only the actions needed for that kitchen.
- A salão operator reaches a non-production monitoring surface that supports customer-facing coordination and exception handling without exposing production controls.
- Area sessions should persist during the shift on fixed shared devices and should not require re-entering the PIN for routine actions.
- If an operator opens the wrong route on a shared device, the product quickly redirects them back to the correct area flow.
- The access step must feel lightweight enough for shared-device operation during a busy service.

## High-Level Technical Constraints

- The experience must work on shared fixed devices used by area during service.
- The first release must rely on area identity, not individual employee accounts.
- Area sessions should persist during the shift on fixed devices and should not require repeated re-authentication for routine use.
- The product must preserve the current two-kitchen model and existing sync-exception workflow.
- Access control must not introduce noticeable friction into frequent operational actions.
- Authorization must be enforced beyond the UI so blocked areas cannot perform protected reads or mutations through direct route access.

## Non-Goals (Out of Scope)

- Individual operator login and personal accountability trails.
- Manager or supervisor override in the first release.
- Salão authority to change kitchen production.
- Broader Stage 6 work on real-time transport, backup guidance, or observability in this first slice.
- A redesign of the current kitchen workflow, split logic, or order-status model.

## Phased Rollout Plan

### MVP (Phase 1)

- Ship area PIN access for Kitchen 1, Kitchen 2, and salão.
- Restrict kitchen actions to the matching kitchen only.
- Keep salão limited to monitoring and sync-exception acknowledgement.
- Enforce protected reads and mutations server-side by area session.
- Success criteria: salão cannot alter production, kitchens cannot mutate the other kitchen’s work, and blocked access cannot be bypassed through direct product routes.

### Phase 2

- Evaluate whether live operation requires a manager override or supervisor path.
- Add stronger area-level visibility into who used which area surface and when.
- Success criteria: exception scenarios can be handled without bypassing the product.

### Phase 3

- Consider individual operator identity only if pilot evidence shows area identity is insufficient.
- Fold in later Operational Hardening work such as backup guidance, observability, and transport reassessment as separate follow-on efforts.
- Success criteria: the operation remains safe, clear, and stable during sustained real-world use.

## Success Metrics

### Release Gates

- 0 successful salão actions that change kitchen production during acceptance testing.
- 100% of production mutations come from the matching kitchen area.
- 100% of cross-kitchen action attempts are blocked.
- 0 successful unauthorized production mutations through direct API access or wrong-area surface during acceptance testing.
- Operators can reach their working surface from shift start in under 10 seconds on a shared device.

### Pilot KPIs

- No increase in service confusion caused by unclear responsibility between kitchen and salão.
- Staff complete routine shift startup without repeated PIN entry during the service cycle.
- Cross-area mistakes that previously depended on verbal correction drop to near zero in live usage.
- Staff continue using the product as the trusted operational surface rather than creating side workarounds.

## Risks and Mitigations

- Shared area PINs may reduce accountability.
- Mitigation: position this release as boundary control, not personal audit.
- Operators may be slowed by extra access steps.
- Mitigation: keep entry area-based and lightweight, then persist the area session during the shift.
- Stakeholders may expect a manager override immediately.
- Mitigation: keep that path explicitly deferred unless field evidence demands it.
- Users may still be confused if the product does not clearly label each area.
- Mitigation: make area identity and allowed actions obvious in every protected surface.

## Architecture Decision Records

- [ADR-001: Area-Based Access Boundaries for Operational Hardening](adrs/adr-001.md) — Starts Stage 6 with area PIN access and strict kitchen versus salão action boundaries.

## Open Questions

- Whether a manager override is needed before or after the first pilot.
- Whether salão should later mark orders as delivered or remain limited to monitoring and exception acknowledgement.
- Whether area PIN rotation should become an operational requirement after the first release.
