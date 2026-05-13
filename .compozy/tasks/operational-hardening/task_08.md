---
status: completed
title: "Plan QA coverage and generate QA artifacts with qa-report"
type: test
complexity: medium
dependencies:
  - task_07
---

# Task 08: Plan QA coverage and generate QA artifacts with qa-report

## Overview
Create the QA planning package for Operational Hardening using the repository root as the QA artifact output path so the resulting files land under `./qa/`. This task should use the `qa-report` skill when available and must fall back to manually creating equivalent artifacts if the skill is unavailable in the execution environment.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST generate or update QA planning artifacts under `./qa/` using `qa-report` with the repository root as `qa-output-path` when the skill is available.
2. MUST create equivalent manual artifacts in the same directory structure if `qa-report` is unavailable, and MUST document that fallback explicitly.
3. MUST cover P0 and P1 flows for area login, logout, session persistence, wrong-area read blocking, wrong-area write blocking, auth-before-side-effect behavior, and deferred catalog access.
4. MUST annotate automation expectations against the repository’s existing Playwright and handler or route test harnesses rather than inventing a new QA framework.
</requirements>

## Subtasks
- [x] 8.1 Generate or update an operational-hardening QA test plan under `qa/test-plans/`.
- [x] 8.2 Generate or update detailed test cases under `qa/test-cases/` covering kitchen, salão, auth, and deferred-catalog flows.
- [x] 8.3 Generate or update a regression suite that identifies smoke, targeted, and full-run coverage for the changed access-control surface.
- [x] 8.4 Record a fallback note in the QA artifacts if the `qa-report` skill is unavailable and equivalent files were created manually.

## Implementation Details
Use the repository root as the QA output path so the planning artifacts align with the existing `qa/` conventions already present in this codebase. See TechSpec sections `Testing Approach`, `Development Sequencing`, `Monitoring and Observability`, and `Technical Considerations`.

### Relevant Files
- `.agents/skills/qa-report/SKILL.md` — Authoritative workflow for the preferred planning path.
- `qa/test-plans/stage-4-playwright-test-plan.md` — Existing QA planning artifact style.
- `qa/test-plans/stage-4-targeted-regression.md` — Existing regression suite style.
- `qa/test-cases/TC-FUNC-001.md` — Current test-case structure reference.
- `qa/test-cases/TC-INT-001.md` — Current integration-style test-case reference.

### Dependent Files
- `qa/verification-report.md` — Task 09 will consume and update execution evidence against these planned flows.
- `e2e/dashboard-smoke.spec.ts` — Existing E2E harness the QA plan should reference for area-authenticated dashboard validation.
- `e2e/order-detail.spec.ts` — Existing detail-flow harness the QA plan should reference for protected reads and writes.
- `e2e/salon-sync-exceptions.spec.ts` — Existing salão flow harness the QA plan should reference for acknowledgment behavior.

### Related ADRs
- [ADR-002: Signed Area Session Cookie with Dedicated Access Entry](adrs/adr-002.md) — Defines session behavior and cookie policy that QA must cover.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Defines auth-before-side-effect behavior that QA must validate.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Defines the deferred catalog surface that QA must treat as blocked by design.

## Deliverables
- Updated or newly generated QA test plan for Operational Hardening under `qa/test-plans/`.
- Updated or newly generated test cases and regression suite entries under `qa/test-cases/` and `qa/test-plans/`.
- Explicit fallback documentation if the `qa-report` skill was unavailable and artifacts were generated manually.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for QA artifact completeness and traceability **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] The QA plan includes objectives, scope, automation strategy, environment requirements, entry criteria, and exit criteria.
  - [x] Each generated test case includes expected results, automation annotations, and traceability to Operational Hardening requirements.
  - [x] The regression suite classifies smoke, targeted, and full validation coverage for access control, protected reads or writes, and catalog deferral.
- Integration tests:
  - [x] QA artifacts reference the repository’s existing Playwright or route-test coverage rather than unsupported automation commands.
  - [x] Fallback documentation is present when `qa-report` is unavailable and manual artifact generation is used.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `./qa/` contains a coherent QA plan package for the Operational Hardening feature.
- Task 09 can execute from these artifacts without inferring missing flows, priorities, or expected blocked surfaces.
