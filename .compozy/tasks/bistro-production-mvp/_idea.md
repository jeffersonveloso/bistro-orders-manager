# Bistro Production MVP Idea

## Overview

Bistro Production MVP is a kitchen-first production control system for Vo Ziluca. It replaces paper order flow with a synchronized digital workflow for two physical kitchens that must prepare parts of the same customer order in parallel.

The product is for kitchen staff first, with a minimal read-only view for salão or expediting. Its value is operational: fewer misread tickets, less shouting across the wall, faster status updates, and better coordination so full orders leave together. V1 stays focused on real kitchen execution, not on becoming a restaurant platform.

## Assumptions

- V1 is `single-store` and supports exactly `two kitchens`.
- The external provider delivers `raw order input`; internal production logic does not depend on provider-specific status semantics.
- Menu item to kitchen ownership is maintained by the internal system in `SQLite`.
- In V1, menu item to kitchen mapping may be created and maintained through `seeded data`.
- The salão or expediter surface is strictly `read-only`.
- Advanced authentication, permissions, and multi-role workflows are out of scope for V1.
- A mocked provider adapter is acceptable for V1 if the real integration path is not completed.
- Simple polling is acceptable for MVP synchronization if full real-time transport is not yet implemented.

## Problem

Vo Ziluca currently relies on paper tickets in an environment where one customer order may require work from two separate kitchens. That creates three compounding failures: item routing depends on manual interpretation, each kitchen loses visibility into the other side's progress, and the final handoff becomes guesswork. In practice, this means orders can be partially ready, blocked waiting for the other kitchen, or delivered with missing items.

A generic digital order list does not solve this. The real problem is synchronized production across two semi-independent preparation cells. Each kitchen needs a filtered operational view of its own work, but the order only creates customer value when both sides finish in sync. The system must therefore model item status, kitchen ticket status, and consolidated order readiness as separate but connected concepts.

## Core Features

| # | Feature | Priority | Description |
| --- | --- | --- | --- |
| F1 | Internal Kitchen Routing Model | Critical | Maintain an internal menu item to kitchen mapping and use it to split every incoming order into kitchen-specific production tickets. |
| F2 | Kitchen Production Board | Critical | Show each kitchen its own production tickets in a Kanban-style board with explicit ticket states and high-legibility layout for touch use. |
| F3 | Shared Full-Screen Order Detail | Critical | Open a full-screen order view that highlights the current kitchen's items while also showing the other kitchen's items and ticket progress. |
| F4 | Explicit Production Status Model | Critical | Distinguish item status, kitchen ticket status, and consolidated order status with fixed semantics so operations do not infer meaning from generic labels. |
| F5 | Fast Status Actions | High | Allow kitchen staff to update item and ticket progress in one tap or a minimal tap flow suitable for rush conditions. |
| F6 | Read-Only Salão / Expediter Summary | Medium | Provide a simplified summary surface with order reference and consolidated readiness, without exposing kitchen internals or editing controls. |

## Operational Status Model

### Item Status

- `new` — the item has entered the kitchen workflow and has not started preparation.
- `in_preparation` — the item is actively being prepared.
- `ready` — the item is finished and ready from that kitchen's perspective.

### Kitchen Ticket Status

- `new` — none of the ticket's items have started.
- `in_preparation` — at least one item has started, and at least one item is not yet ready.
- `ready` — all items assigned to that kitchen are ready.

### Order Status

- `new` — both kitchen tickets are still `new`.
- `in_progress` — at least one kitchen ticket has started, and neither completion condition below has been met.
- `partially_ready` — one kitchen ticket is `ready`, while the other is still `new` or `in_preparation`.
- `ready_to_serve` — all required kitchen tickets are `ready`.

These status definitions are fixed assumptions for V1 and should be treated as implementation inputs, not as open interpretation.

## MVP Acceptance Criteria

| Criterion | Target | How to Validate |
| --- | --- | --- |
| Order split correctness | 100% of seeded mixed-kitchen orders split into the expected kitchen tickets | Automated tests and seed scenario assertions |
| Internal mapping enforcement | 100% of routed items resolve through internal kitchen mapping | Tests covering mapped and unmapped item behavior |
| Consolidated status correctness | 100% of order states derived correctly from kitchen ticket states | Unit tests for all status transitions |
| Cross-kitchen detail visibility | 100% of split orders show both kitchens' progress in order detail | Functional verification in the UI |
| Status action flow | Main production actions complete in <= 1 interaction step per state change | Manual verification against the final UI flow |
| Salão summary isolation | 100% of salão view remains read-only and hides kitchen internals | Functional verification in the UI |

## Pilot / Business KPIs

| KPI | Target | How to Measure |
| --- | --- | --- |
| Order-to-screen latency | < 2 seconds | Measure time between order ingestion and visibility on both kitchen boards in local MVP runs |
| Cross-kitchen completion gap | <= 3 minutes for 85% of split orders | Track the time delta between both kitchen tickets reaching `ready` |
| Coordination error reduction | >= 50% vs paper baseline | Compare incomplete, mistimed, or manually corrected orders in pilot simulations |
| Status action speed | <= 3 seconds per update | Time common actions such as start preparation and mark ready during usability checks |
| Kitchen workflow adoption | >= 90% of simulated orders processed entirely in the system | Observe pilot usage without fallback to paper |

## Feature Assessment

| Criteria | Question | Score |
| --- | --- | --- |
| **Impact** | How much more valuable does this make the product? | Must do |
| **Reach** | What % of users would this affect? | Strong |
| **Frequency** | How often would users encounter this value? | Must do |
| **Differentiation** | Does this set us apart or just match competitors? | Strong |
| **Defensibility** | Is this easy to copy or does it compound over time? | Maybe |
| **Feasibility** | Can we actually build this? | Must do |

Leverage type: `Quick Win`

## Council Insights

- **Recommended approach:** Build a kitchen-first synchronized production system, not a broad restaurant operations platform.
- **Key trade-offs:** Use explicit domain modeling for split and synchronization rules, but avoid heavyweight architectural ceremony outside those boundaries.
- **Risks identified:** UI that is slower than paper under pressure, ambiguous status semantics, stale or misleading cross-kitchen state, and early coupling to external provider payloads.
- **Stretch goal (V2+):** Add smart orchestration such as SLA timers, bottleneck alerts, and more active expediting once the base workflow is validated.

## Out of Scope (V1)

- **Multi-branch or multi-tenant support** — Not needed to validate the two-kitchen workflow at one bistro.
- **Deep Anota AI production sync semantics** — The adapter boundary should exist now, but full provider behavior can wait until the real integration path is stable.
- **Inventory, purchasing, or menu management suites** — These add operational breadth but do not solve the immediate production synchronization problem.
- **Payments, CRM, or customer communication flows** — Outside the core kitchen execution loop.
- **Advanced staff roles and permission systems** — Adds surface area before the core workflow is proven.
- **Analytics dashboards and reporting suites** — Valuable later, but they do not help the line cook or expediter finish today's orders together.

## Architecture Decision Records

- [ADR-001: Kitchen-First Synchronized Production Scope for V1](adrs/adr-001.md) — Locks the V1 scope around kitchen synchronization, explicit production tickets, and a minimal read-only expediter summary.

## Research Context Appendix

Restaurant technology investment remains strong because operating pressure remains high. The National Restaurant Association reported on May 5, 2026 that restaurant and lodging job openings averaged 856,000 over the prior 15 months, and Association research published March 19, 2025 said 77% of operators still viewed recruitment and retention as a significant challenge. In the Association's 2024 technology landscape research, 52% of operators said they planned to invest in kitchen technology.

Competitive KDS products consistently emphasize multi-station routing, expo visibility, timers, and low-friction status changes. Toast documentation centers prep stations and expediter views; Fleksa and 1.KDS emphasize multi-station routing, color-coded urgency, and fast kitchen interaction. On July 31, 2025, Restaurant Dive reported that Wingstop's Smart Kitchen rollout reduced ticket times by 40% within four weeks, reinforcing that kitchen synchronization can create measurable operational gains.

## Open Questions

- None for V1 drafting. Any remaining ambiguity should be resolved as implementation detail within the fixed assumptions and status model above.
