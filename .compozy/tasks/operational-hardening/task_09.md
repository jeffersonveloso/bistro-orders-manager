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
Run the final QA pass for Operational Hardening using the artifacts produced in task 08 and the repository root as the QA output path. This task should use the `qa-execution` skill when available, fall back to equivalent manual verification if the skill is unavailable, and must refresh the verification report with evidence for area-authenticated flows, blocked access, and auth-before-side-effect behavior.

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
4. MUST validate that unauthorized or wrong-area requests do not trigger protected operational side effects such as `maybeRefreshRuntimeProviderSync()`, catalog pull work, or repository mutations.
5. MUST update README or supporting docs before closing the task if verified runtime behavior, commands, or caveats differ from the documented baseline.
</requirements>

## Subtasks
- [x] 9.1 Execute the repository verification gate and the planned browser, API, and route-level flows for Operational Hardening.
- [x] 9.2 Validate area login, logout, session persistence, protected reads, protected writes, and deferred catalog behavior against task 08 artifacts.
- [x] 9.3 Record issues, screenshots, and verification evidence under `./qa/`.
- [x] 9.4 Apply post-QA documentation corrections if verified behavior differs from the TechSpec assumptions or repository docs.
- [x] 9.5 Publish a final verification report with explicit blockers if any auth, environment, or browser prerequisites remain unavailable.

## Implementation Details
Use the `qa-execution` skill first when available. If it is unavailable, reproduce the same scope manually with the repository’s build, test, API, and browser interfaces and note the limitation in the report. See TechSpec sections `Testing Approach`, `Monitoring and Observability`, `Technical Considerations`, and the QA planning artifacts created in task 08.

### Relevant Files
- `.agents/skills/qa-execution/SKILL.md` — Preferred execution workflow and artifact expectations.
- `qa/verification-report.md` — Verification report path that must be refreshed with new evidence.
- `qa/test-plans/` — Input planning artifacts from task 08.
- `qa/test-cases/` — Execution matrix and case references from task 08.
- `e2e/dashboard-smoke.spec.ts` — Existing board-level coverage reference that should be updated or executed through the new auth flow.

### Dependent Files
- `qa/issues/` — Task may create or update issue files here.
- `qa/screenshots/` — Task may create evidence files here.
- `qa/verification-report.md` — Task must refresh this file with final evidence.
- `README.md` — Documentation baseline that may require final correction after verified execution.

### Related ADRs
- [ADR-002: Signed Area Session Cookie with Dedicated Access Entry](adrs/adr-002.md) — Must be validated through runtime session behavior.
- [ADR-003: Explicit Server Guards in Pages and API Handlers](adrs/adr-003.md) — Must be validated through denied-read, denied-write, and auth-before-side-effect behavior.
- [ADR-005: Remove Catalog Administration from the First Operational Area Matrix](adrs/adr-005.md) — Must be validated through blocked catalog access behavior.

## Deliverables
- Fresh QA execution evidence under `./qa/`, including an updated `qa/verification-report.md`.
- Any issue files or screenshots discovered during execution.
- Explicit fallback note if `qa-execution` was unavailable and equivalent manual verification was used.
- Post-QA documentation corrections applied to README or supporting docs when verified behavior differs from the documented baseline.
- Unit tests with 80%+ coverage **(REQUIRED)**.
- Integration tests for final runtime verification and regression confirmation **(REQUIRED)**.

## Tests
- Unit tests:
  - [ ] Verification report records executed commands, timestamps, exit codes, verdicts, and blockers.
  - [ ] Any doc corrections are traceable back to executed evidence rather than assumptions.
  - [ ] Fallback execution note is present if `qa-execution` was unavailable.
- Integration tests:
  - [ ] Repository verification gate passes from the current branch state.
  - [ ] Critical flows from task 08 are executed and recorded, including blocked wrong-area reads, blocked wrong-area writes, and blocked catalog access.
  - [ ] Verification evidence explicitly proves denied access does not trigger protected operational side effects.
  - [ ] Any updated E2E or route-level regression coverage passes after fixes or documentation corrections are applied.
- Test coverage target: >=80%
- All tests must pass

## Success Criteria
- All tests passing
- Test coverage >=80%
- The feature has fresh QA evidence under `./qa/` and a final verification report.
- Documentation reflects verified runtime behavior and denial behavior rather than pre-QA assumptions.
