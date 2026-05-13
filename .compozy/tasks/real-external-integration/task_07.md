---
status: completed
title: "Draft live integration docs and post-QA finalization checklist"
type: docs
complexity: medium
dependencies:
  - task_05
  - task_06
---

# Task 07: Draft live integration docs and post-QA finalization checklist

## Overview
Prepare the documentation baseline for the real integration before formal QA execution, covering setup, scheduler behavior, exception handling, and operational ownership. This task must also leave a clear post-QA checklist so the final verification task can update any behavior, commands, or caveats that differ from documented expectations.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST update project documentation with the Phase 1 real integration contract, including provider mode selection, secrets, scheduler expectations, catalog `externalID` requirements, and exception handling ownership.
2. MUST clearly identify any commands, environment variables, or operator steps that still require verification in task 09.
3. MUST include a post-QA finalization checklist so the last QA task can reconcile docs with verified runtime behavior.
4. SHOULD keep the docs explicit about Phase 1 scope boundaries and fallback behavior when live provider prerequisites are unavailable.
</requirements>

## Subtasks
- [x] 7.1 Update README or equivalent docs with the real integration overview, environment variables, and startup or reconciliation prerequisites.
- [x] 7.2 Document webhook, reconciliation, and acknowledgment flows at an operator or maintainer level.
- [x] 7.3 Document provider catalog `externalID` expectations and the fail-closed behavior for unmapped items.
- [x] 7.4 Add a post-QA verification checklist covering commands, screenshots, operational caveats, and any provisional values to confirm in task 09.

## Implementation Details
Keep documentation grounded in the implemented system and avoid inventing live-provider details that have not been validated. See TechSpec sections `Integration Points`, `Technical Dependencies`, and `Known Risks`.

### Relevant Files
- `README.md` — main architecture, mocked-vs-real integration, and setup instructions that need Phase 1 updates.
- `docs/roadmap.md` — milestone reference that may need status or next-step framing aligned with the new integration work.
- `.compozy/tasks/real-external-integration/_prd.md` — product behavior source of truth for scope and operator ownership.
- `.compozy/tasks/real-external-integration/_techspec.md` — technical source of truth for auth, sync, and exception rules.

### Dependent Files
- `qa/verification-report.md` — task 09 will update verified outcomes against the checklist created here.
- `qa/test-plans/` — task 08 will use the documented flows to seed QA planning artifacts.
- `src/infrastructure/anota-ai-provider.ts` — implemented env and provider assumptions must match documentation.

### Related ADRs
- [ADR-003: Alert Only on Operationally Relevant External Changes and Route Resolution to Atendimento](adrs/adr-003.md) — Defines operator ownership for exception handling.
- [ADR-004: Hybrid Ingestion With Webhook Trigger and Scheduled Reconciliation](adrs/adr-004.md) — Defines webhook and reconciliation behavior that must be documented.
- [ADR-007: Shared Secret Authentication for Sync Entry Points](adrs/adr-007.md) — Defines environment and secret handling that must be documented.
- [ADR-008: Use Provider Catalog External IDs as the Canonical Menu Mapping Key](adrs/adr-008.md) — Defines the catalog contract that operators must understand.

## Deliverables
- Updated baseline documentation for real external integration setup and operations.
- A post-QA finalization checklist identifying items that task 09 must verify or correct with evidence.
- Documentation review checks for scope lock, environment coverage, and operator ownership clarity.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for documentation completeness and consistency with implemented behavior **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Documentation review confirms all required env vars, scheduler expectations, and secret surfaces are listed.
  - [x] Documentation review confirms Phase 1 non-goals and fail-closed unmapped-item behavior are stated explicitly.
  - [x] Documentation review confirms the post-QA checklist identifies every provisional command or runtime assumption.
- Integration tests:
  - [x] README and supporting docs remain consistent with the approved PRD and TechSpec flow descriptions.
  - [x] Documentation references to routes, exceptions, and operator ownership match the implemented API and UI surfaces from tasks 05 and 06.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- Docs are good enough to support implementation and rollout before QA, without pretending unverified behavior is final.
- Task 09 has a concrete checklist for post-QA doc corrections driven by fresh evidence.
