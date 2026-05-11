# Phase 1 Real Integration QA Test Plan

## Executive Summary

This plan covers the Phase 1 Anota AI live-integration surface for Vó Ziluca: webhook-first intake, scheduled reconciliation, fail-closed missing mapping behavior, post-import divergence signaling, external cancellation handling, and salão acknowledgment of unresolved exceptions. The objective is to give task 09 a complete execution package for P0 and P1 coverage without requiring any new QA framework or inferred flows.

The highest release risk is not the kitchen workflow itself. It is the sync boundary: duplicate provider delivery, technical ingestion failures, unmapped provider catalog IDs, and provider-side changes after import can all undermine board trust if they are not surfaced consistently. Phase 1 therefore treats exception visibility, replayability, and operator acknowledgment as release-critical behavior.

## Artifact Generation Note

- Requested workflow: use the `qa-report` skill with the repository root as the `qa-output-path`.
- Execution result for task 08: the skill is available as documentation plus interactive shell scripts, but no non-interactive generator or callable QA MCP endpoint is exposed in this environment.
- Equivalent artifacts were created manually under `./qa/` following the `qa-report` structure so task 09 can consume them as the canonical QA package.
- See `qa/test-plans/real-integration-qa-report-fallback.md` for the explicit fallback record.

## Scope

### In Scope

- `POST /api/integrations/anota-ai/webhook`
- `POST /api/internal/sync/anota-ai`
- `POST /api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge`
- Sync exception visibility in the board, order detail, and salão surfaces
- P0 and P1 flows for:
  - confirmed webhook intake
  - duplicate delivery protection
  - replay and reconciliation recovery
  - missing mapping fail-closed behavior
  - `changed_externally`
  - `canceled_externally`
  - salão acknowledgment behavior
- Existing automation alignment with:
  - Playwright E2E specs under `e2e/`
  - Vitest API and application tests under `app/` and `src/`

### Out of Scope

- Full live-provider credential provisioning
- Pre-confirmation provider states beyond Phase 1 scope
- Automatic provider-to-board rewrite behavior after import
- New QA tooling, alternate harnesses, or external test runners
- Figma or visual-baseline validation for these flows

## Phase 1 Requirement Map

| Requirement ID | Priority | Requirement | Primary Sources |
|----------------|----------|-------------|-----------------|
| `PH1-P0-01` | P0 | Confirmed-ready provider orders import through the webhook or shared sync path into production without manual relay. | PRD Goals, ADR-001, ADR-004 |
| `PH1-P0-02` | P0 | Duplicate provider delivery must not create a second production order. | PRD Success Metrics, ADR-001, ADR-004 |
| `PH1-P0-03` | P0 | Missing provider catalog mapping blocks the entire order and opens `missing_mapping`. | ADR-006, ADR-008, TechSpec Apply Algorithm |
| `PH1-P0-04` | P0 | Operationally relevant external changes open `changed_externally` without rewriting kitchen data. | ADR-002, ADR-003, TechSpec Apply Algorithm |
| `PH1-P0-05` | P0 | Provider cancellation opens `canceled_externally` without mutating imported kitchen data. | ADR-002, ADR-003, TechSpec Apply Algorithm |
| `PH1-P1-01` | P1 | Reconciliation or replay resolves `ingestion_failed` and `missing_mapping` after the underlying cause is fixed. | ADR-004, ADR-006, TechSpec Apply Algorithm |
| `PH1-P1-02` | P1 | Salão can acknowledge an unresolved sync exception, but the order remains visible until reconciliation resolves it. | PRD User Stories, ADR-003, TechSpec API Endpoints |
| `PH1-P1-03` | P1 | Board, order detail, and salão surfaces expose unresolved sync markers and the minimal sync trail needed for operations. | PRD Core Features, Task 06, TechSpec Impact Analysis |

## Test Strategy And Approach

- Use the existing Vitest route and application suites as the deterministic API/integration safety net for sync behavior:
  - `app/api/provider-sync-routes.test.ts`
  - `src/application/provider-sync-service.test.ts`
  - `src/application/production-service.test.ts`
- Use the existing Playwright suite for operator-facing public flows:
  - `e2e/dashboard-smoke.spec.ts`
  - `e2e/order-detail.spec.ts`
  - `e2e/salon-sync-exceptions.spec.ts`
- Keep task 09 responsible for fresh execution evidence, runtime screenshots, and any pilot-environment deltas in `qa/verification-report.md`.
- Reuse the post-QA checklist from task 07 as the execution gate for environment values, real hostnames, scheduler cadence, and provider webhook evidence.

## Automation Strategy

- Do not introduce Cypress, Postman collections, or ad hoc shell harnesses for this feature.
- Route and service-level sync behavior should stay on the existing Vitest harness through `npm run test:run -- ...`.
- Browser-visible operator flows should stay on the existing Playwright harness through `npm run test:e2e`.
- Manual validation remains necessary only for live credential wiring, real webhook evidence, scheduler cadence, and any operator-signoff screenshots required by task 09.
- When a planned flow is already covered by code-level automation but still needs runtime proof, mark the automation as `Existing` and use task 09 to gather fresh execution evidence rather than redefining the case as manual-only.

## Environment Requirements

- macOS or Linux development environment
- Node.js with project dependencies installed
- Local SQLite filesystem access
- Playwright Chromium installed for browser execution
- Environment variables aligned with the live-integration contract when running outside the mock default:
  - `BISTRO_ORDER_SYNC_PROVIDER_MODE`
  - `BISTRO_ANOTA_AI_TOKEN`
  - `BISTRO_ANOTA_AI_BASE_URL`
  - `BISTRO_ANOTA_WEBHOOK_SECRET`
  - `BISTRO_INTERNAL_SYNC_SECRET`
  - `BISTRO_DATABASE_PATH`
- Access to the repository root `./qa/` output path

## Entry Criteria

- `README.md`, `docs/live-integration-phase-1.md`, and `qa/live-integration-post-qa-checklist.md` are aligned with the current Phase 1 contract.
- The repository boots and the existing automated harnesses are installable and runnable locally.
- Route, service, and production read-model tests are available for sync flows.
- Playwright E2E coverage remains available for dashboard and salão operator flows.
- Task 09 has a defined QA environment or an explicitly documented fallback environment for mock-mode execution.

## Exit Criteria

- All planned P0 cases pass.
- At least 90% of planned P1 cases pass.
- No unresolved Critical or High bug blocks confirmed-order intake, fail-closed mapping behavior, change signaling, cancellation signaling, or salão acknowledgment.
- `qa/verification-report.md` contains fresh execution evidence, commands, warnings, and verdict for task 09.
- Any live-environment blocker or manual-only gap is documented explicitly instead of being implied closed.

## Monitoring And Observability Checks

- Operator-visible observability:
  - board-level unresolved sync alert banner
  - per-order sync marker in board and salão
  - minimal sync trail in order detail
- Persistence and sync bookkeeping observability through existing tests:
  - `provider_events`
  - `sync_runs`
  - `provider_orders`
  - `order_sync_exceptions`
- Release-level evidence documents:
  - `qa/live-integration-post-qa-checklist.md`
  - `qa/verification-report.md`

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Live provider credentials are unavailable during QA execution | Medium | High | Keep deterministic Vitest and Playwright coverage as the baseline and document the environment gap in task 09 evidence |
| Duplicate protection regresses while webhook and reconciliation both target the same order | Medium | High | Keep duplicate-import and replay coverage in route and service suites as P0 |
| Staff sees an exception marker but cannot infer ownership or next step | Medium | High | Keep salão acknowledgment and unresolved-visibility behavior in P1 coverage and preserve task 07 checklist handoff |
| Missing catalog `externalID` causes silent partial import | Low | Critical | Treat missing mapping as a dedicated P0 fail-closed case with no partial acceptance |
| Planning drift introduces unsupported automation commands | Medium | Medium | Validate all QA artifacts against existing `npm run test:run` and `npm run test:e2e` surfaces with automated tests |

## Timeline And Deliverables

- Deliver a Phase 1 QA plan in `qa/test-plans/real-integration-test-plan.md`
- Deliver detailed live-integration test cases in `qa/test-cases/`
- Deliver a regression suite in `qa/test-plans/real-integration-regression.md`
- Preserve the explicit manual-fallback note in `qa/test-plans/real-integration-qa-report-fallback.md`
- Use task 09 to execute the plan and refresh `qa/verification-report.md`
