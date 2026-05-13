---
status: completed
title: "Execute end-to-end QA and verification with qa-execution"
type: test
complexity: high
dependencies:
  - task_08
---

# Task 09: Execute end-to-end QA and verification with qa-execution

## Overview
Run the final QA pass for the real integration using the artifacts produced in task 08 and the repository root as the QA output path. This task should use the `qa-execution` skill when available, fall back to equivalent manual verification if the skill is unavailable, and must update documentation when verified behavior differs from the baseline docs created in task 07.

<critical>
- ALWAYS READ the PRD and TechSpec before starting
- REFERENCE TECHSPEC for implementation details — do not duplicate here
- FOCUS ON "WHAT" — describe what needs to be accomplished, not how
- MINIMIZE CODE — show code only to illustrate current structure or problem areas
- TESTS REQUIRED — every task MUST include tests in deliverables
</critical>

<requirements>
1. MUST execute final verification using `qa-execution` with the repository root as `qa-output-path` when the skill is available.
2. MUST fall back to equivalent repository verification commands, API validation, browser validation, and manual evidence collection when `qa-execution` is unavailable, and MUST document that fallback explicitly.
3. MUST consume the QA artifacts from task 08 and produce a fresh `qa/verification-report.md`, issue files, and screenshots or evidence as applicable.
4. MUST update README or supporting docs before closing the task if the observed runtime behavior, commands, or caveats differ from the documentation baseline from task 07.
</requirements>

## Subtasks
- [x] 9.1 Execute the repository verification gate and the planned API or browser flows for the real integration surface.
- [x] 9.2 Validate webhook, reconciliation, missing mapping, divergence, cancellation, and salão acknowledgment behaviors against task 08 artifacts.
- [x] 9.3 Record issues, screenshots, and verification evidence under `./qa/`.
- [x] 9.4 Apply post-QA documentation corrections if verified behavior differs from task 07 assumptions.
- [x] 9.5 Publish a final verification report with explicit blockers if any live-provider or environment prerequisites remain unavailable.

## Implementation Details
Use the `qa-execution` skill first when available. If it is unavailable, reproduce the same scope manually with the repository’s build, test, API, and browser interfaces and note the limitation in the report. See TechSpec sections `Testing Approach`, `Monitoring and Observability`, `Known Risks`, and the post-QA checklist created in task 07.

### Relevant Files
- `.agents/skills/qa-execution/SKILL.md` — preferred execution workflow and artifact expectations.
- `qa/verification-report.md` — current verification report path that must be refreshed with new evidence.
- `qa/test-plans/` — input planning artifacts from task 08.
- `qa/test-cases/` — execution matrix and case references from task 08.
- `e2e/api-contract.spec.ts` — current API verification harness.
- `e2e/dashboard-smoke.spec.ts` — current board-level smoke coverage reference.
- `e2e/order-detail.spec.ts` — current order detail coverage reference.
- `README.md` — documentation baseline that may require final correction after verified execution.

### Dependent Files
- `qa/issues/` — task may create or update issue files here.
- `qa/screenshots/` — task may create evidence files here.
- `qa/verification-report.md` — task must refresh this file with final evidence.
- `docs/roadmap.md` — may need a status touch-up only if verified outcomes materially change the rollout framing.

### Related ADRs
- [ADR-002: Signal External Order Changes Without Rewriting the Kitchen Board](adrs/adr-002.md) — Must be validated through runtime behavior.
- [ADR-003: Alert Only on Operationally Relevant External Changes and Route Resolution to Atendimento](adrs/adr-003.md) — Must be validated through operator-surface behavior.
- [ADR-007: Shared Secret Authentication for Sync Entry Points](adrs/adr-007.md) — Must be validated through route-level auth behavior.

## Deliverables
- Fresh QA execution evidence under `./qa/`, including an updated `qa/verification-report.md`.
- Any issue files or screenshots discovered during execution.
- Explicit fallback note if `qa-execution` was unavailable and equivalent manual verification was used.
- Post-QA documentation corrections applied to README or supporting docs when verified behavior differs from task 07.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for final runtime verification and regression confirmation **(REQUIRED)**.

## Tests
- Unit tests:
  - [x] Verification report records executed commands, timestamps, exit codes, verdicts, and blockers.
  - [x] Any doc corrections are traceable back to executed evidence rather than assumptions.
  - [x] Fallback execution note is present if `qa-execution` was unavailable.
- Integration tests:
  - [x] Repository verification gate passes from the current branch state.
  - [x] Critical flows from task 08 are executed and recorded, including sync exception visibility and acknowledgment behavior.
  - [x] Any updated E2E or API regression coverage passes after fixes or documentation corrections are applied.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The feature has fresh QA evidence under `./qa/` and a final verification report.
- Documentation reflects verified runtime behavior rather than pre-QA assumptions.
