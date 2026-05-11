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
Create the QA planning package for the real integration using the repository root as the QA artifact output path so the resulting files land under `./qa/`. This task should use the `qa-report` skill when available and must fall back to manually creating equivalent artifacts if the skill is unavailable in the execution environment.

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
3. MUST cover P0 and P1 flows for webhook intake, reconciliation, missing mapping, changed externally, canceled externally, and salão acknowledgment behavior.
4. MUST annotate automation expectations against the repository’s existing Playwright and API test harness rather than inventing a new QA framework.
</requirements>

## Subtasks
- [x] 8.1 Generate or update a real-integration QA test plan under `qa/test-plans/`.
- [x] 8.2 Generate or update detailed test cases under `qa/test-cases/` covering sync happy paths, exception paths, and operator flows.
- [x] 8.3 Generate or update a regression suite that identifies smoke, targeted, and full-run coverage for the changed surface.
- [x] 8.4 Record a fallback note in the QA artifacts if the `qa-report` skill is unavailable and equivalent files were created manually.

## Implementation Details
Use the repository root as the QA output path so the planning artifacts align with the existing `qa/` conventions already present in this codebase. See TechSpec sections `Testing Approach`, `Development Sequencing`, and `Monitoring and Observability`.

### Relevant Files
- `qa/test-plans/stage-4-playwright-test-plan.md` — existing QA planning artifact style.
- `qa/test-plans/stage-4-targeted-regression.md` — existing regression suite style.
- `qa/test-cases/TC-FUNC-001.md` — current test case structure reference.
- `qa/test-cases/TC-INT-001.md` — current integration-style test case reference.
- `.agents/skills/qa-report/SKILL.md` — authoritative workflow for the preferred planning path.

### Dependent Files
- `qa/verification-report.md` — task 09 will consume and update execution evidence against these planned flows.
- `e2e/*.spec.ts` — existing E2E harness that planned automation annotations should reference.
- `README.md` — documented commands and flows from task 07 should align with the QA plan.

### Related ADRs
- [ADR-001: Controlled Confirmed-Order Ingestion for Real External Integration](adrs/adr-001.md) — Defines the live-order intake scope that QA must cover.
- [ADR-002: Signal External Order Changes Without Rewriting the Kitchen Board](adrs/adr-002.md) — Defines the divergence behavior that QA must validate.
- [ADR-006: Fail Closed on Unmapped Provider Items](adrs/adr-006.md) — Defines a critical exception path requiring explicit coverage.

## Deliverables
- Updated or newly generated QA test plan for real external integration under `qa/test-plans/`.
- Updated or newly generated test cases and regression suite entries under `qa/test-cases/` and `qa/test-plans/`.
- Explicit fallback documentation if the `qa-report` skill was unavailable and artifacts were generated manually.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for QA artifact completeness and traceability **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] The QA plan includes objectives, scope, automation strategy, environment requirements, entry criteria, and exit criteria.
  - [x] Each generated test case includes expected results, automation annotations, and traceability to Phase 1 requirements.
  - [x] The regression suite classifies smoke, targeted, and full validation coverage for the changed sync surface.
- Integration tests:
  - [x] QA artifacts reference the repository’s existing Playwright or API coverage rather than unsupported automation commands.
  - [x] Fallback documentation is present when `qa-report` is unavailable and manual artifact generation is used.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- `./qa/` contains a coherent QA plan package for the real integration feature.
- Task 09 can execute from these artifacts without needing to infer missing flows or priorities.
