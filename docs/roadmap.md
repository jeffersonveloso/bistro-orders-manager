# Roadmap

Updated: `2026-05-11`

This roadmap breaks the product into delivery stages and marks what is already done in the current repository.

## Status Legend

- `[x]` Delivered
- `[~]` Partially delivered / next refinement cycle
- `[ ]` Planned

## Stage 0 — Discovery, Scope, and Operational Model

Status: `[x] Delivered`

- `[x]` Feature idea structured and approved in [.compozy/tasks/bistro-production-mvp/_idea.md](../.compozy/tasks/bistro-production-mvp/_idea.md)
- `[x]` V1 assumptions defined
- `[x]` Item, kitchen ticket, and consolidated order status semantics locked
- `[x]` Scope ADR created in [.compozy/tasks/bistro-production-mvp/adrs/adr-001.md](../.compozy/tasks/bistro-production-mvp/adrs/adr-001.md)

## Stage 1 — Technical Foundation

Status: `[x] Delivered`

- `[x]` Next.js 16 App Router baseline configured
- `[x]` Clean separation between `domain`, `application`, `infrastructure`, and `interface/UI`
- `[x]` Internal provider boundary created through `OrderProviderPort`
- `[x]` SQLite persistence added with `better-sqlite3`
- `[x]` Internal `menu item -> kitchen` mapping stored locally
- `[x]` Seed and mock provider flow implemented for demo data

## Stage 2 — Kitchen Operations MVP

Status: `[x] Delivered`

- `[x]` Main kitchen dashboard implemented at `/`
- `[x]` Orders split automatically into two kitchen flows
- `[x]` Kitchen board grouped by `new`, `in_preparation`, and `ready`
- `[x]` Full-screen order detail implemented at `/orders/[orderId]`
- `[x]` Fast operational actions implemented:
  - `[x]` start kitchen
  - `[x]` mark item in preparation
  - `[x]` mark item ready
  - `[x]` complete kitchen
- `[x]` Dashboard adjusted to maximize kitchen area
- `[x]` Salão view separated into its own screen
- `[x]` Salão summary simplified to one consolidated status per order

## Stage 3 — Application Interface and Data Endpoints

Status: `[x] Delivered`

- `[x]` Board API available at `/api/board`
- `[x]` Order detail API available at `/api/orders/[orderId]`
- `[x]` Item status mutation API available
- `[x]` Kitchen ticket mutation API available
- `[x]` TanStack Query polling configured for MVP synchronization

## Stage 4 — Stability and Acceptance Coverage

Status: `[x] Delivered`

- `[x]` Add automated tests for:
  - `[x]` split logic
  - `[x]` ticket status derivation
  - `[x]` consolidated order status derivation
  - `[x]` API mutation flows
- `[x]` Add explicit handling for unmapped menu items
- `[x]` Add seed scenarios covering:
  - `[x]` order with one kitchen only
  - `[x]` mixed order with one side ready
  - `[x]` fully ready order
- `[x]` Add regression checks for operational status transitions

## Stage 5 — Real External Integration

Status: `[~] Partially delivered / QA pending`

- `[x]` Extend the provider boundary with a real Anota AI adapter
- `[x]` Lock the ingestion strategy as webhook-first plus scheduled reconciliation
- `[x]` Add idempotent import protection for external events
- `[x]` Persist sync metadata and provider audit trail
- `[x]` Surface sync exceptions in board, order detail, and salão
- `[x]` Document the Phase 1 provider contract, ownership, and post-QA checklist
- `[ ]` Verify live commands, scheduler behavior, and operator caveats with fresh QA evidence
- `[ ]` Reconcile rollout docs against verified runtime behavior after QA

## Stage 6 — Operational Hardening

Status: `[ ] Planned`

- `[ ]` Add authentication and role boundaries if the operation requires it
- `[ ]` Add stronger read/write separation for kitchen vs salão surfaces
- `[ ]` Add real-time transport if polling becomes insufficient
- `[ ]` Add startup, production, and backup guidance for SQLite usage
- `[ ]` Add observability for sync failures and stalled orders

## Stage 7 — Post-MVP Expansion

Status: `[ ] Planned`

- `[ ]` Kitchen SLA timers and urgency indicators
- `[ ]` Expeditor-focused orchestration improvements
- `[ ]` Manager analytics and reporting
- `[ ]` Menu mapping maintenance UI
- `[ ]` Multi-store or multi-kitchen generalization only after the current workflow is proven

## Current Baseline

The repository already has a functional local MVP with:

- `[x]` local data persistence
- `[x]` seeded demo orders
- `[x]` automated acceptance and regression tests
- `[x]` separate kitchen and salão surfaces
- `[x]` consolidated order status
- `[x]` authenticated Phase 1 sync routes
- `[x]` provider sync exception visibility
- `[x]` Phase 1 live integration documentation baseline
- `[x]` lint passing
- `[x]` test suite passing
- `[x]` production build passing

## Recommended Next Step

Priority recommendation:

1. Finish Stage 5 QA tasks and reconcile the docs with verified runtime evidence
2. Stage 6 — harden the operation once the integration path is stable
