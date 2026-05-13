# Stage 4 Playwright Test Plan

## Executive Summary

This plan covers the Stage 4 stability work for the kitchen-first MVP. The main objective is to verify that the seeded production scenarios, kitchen mutations, salon read model, and public APIs remain consistent under end-to-end usage. The key risk is that Stage 4 currently has strong unit and integration coverage, but no browser-level regression safety for the real public surfaces.

## Scope

### In Scope

- Kitchen dashboard at `/`
- Order detail at `/orders/[orderId]?kitchen=...`
- Salon view at `/salon`
- Public APIs `/api/board` and `/api/orders/[orderId]`
- Seeded scenarios:
  - single-kitchen order
  - partially-ready order
  - ready-to-serve order
- Kitchen actions:
  - start item
  - mark item ready
  - start kitchen
  - complete kitchen

### Out of Scope

- Real external provider integration
- Authentication and authorization
- Real-time transport beyond current polling behavior
- Visual comparison against Figma

## Test Strategy And Approach

- Use Playwright for browser and HTTP-level regression coverage of the public MVP flows.
- Keep deterministic execution by running against a dedicated SQLite database for E2E.
- Validate changed Stage 4 surfaces first, then one unchanged regression-critical flow outside the mutation path.
- Preserve one manual-only visual check for salon clarity because no visual baseline or Figma contract exists.

## Automation Strategy

- Browser flows for dashboard, order detail, and salon should be automated as Playwright E2E.
- API read models should be validated with Playwright request-based tests.
- Visual clarity and qualitative layout judgment remain manual-only for now.
- At planning time the repository has no E2E harness, so Playwright setup is the gating task for execution.

## Environment Requirements

- OS: macOS or Linux developer environment
- Browsers: Playwright Chromium
- Node.js with project dependencies installed
- Local SQLite filesystem access under the repository
- Next.js application available on local loopback

## Entry Criteria

- Repository builds and lints locally
- Mock provider and SQLite seed flow are functional
- Dedicated E2E database path is available
- Playwright package and browser binary are installed

## Exit Criteria

- All P0 cases pass
- At least 90% of P1 cases pass
- No open Critical or High bugs remain in scoped flows
- Playwright smoke command runs successfully for critical public flows
- Manual-only coverage gaps are explicitly documented

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| No existing E2E harness | High | High | Add minimal Playwright harness and canonical command |
| Shared SQLite state makes tests flaky | Medium | High | Isolate E2E database path and reset it per run |
| Polling causes timing-sensitive assertions | Medium | Medium | Prefer stable URL/text assertions and explicit waits |
| Browser automation unavailable in environment | Medium | High | Use Playwright headless execution and document any missing browser binaries |
| Visual regressions in salon remain undetected | Medium | Medium | Keep one manual-only test case and screenshot evidence in QA artifacts |

## Timeline And Deliverables

- Deliver `qa/test-cases/` artifacts for P0/P1 flows
- Add Playwright harness and specs for critical public flows
- Execute baseline plus E2E coverage
- Produce `qa/verification-report.md`

