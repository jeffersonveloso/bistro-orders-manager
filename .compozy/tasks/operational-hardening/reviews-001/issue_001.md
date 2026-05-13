---
provider: manual
pr:
round: 1
round_created_at: 2026-05-13T16:29:36Z
status: resolved
file: app/access/page.tsx
line: 36
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Missing switch-area path for shared devices

## Review Comment

The implementation never gives an operator a real way to hand a fixed device to another area once a session is active. `app/access/page.tsx` immediately redirects any valid session back to its canonical home, and the protected surfaces (`src/components/kds/dashboard-client.tsx`, `src/components/kds/salon-client.tsx`, and `src/components/kds/order-detail-client.tsx`) do not expose any control that calls `POST /api/access/logout`.

That violates the approved shared-device flow in ADR-002 and the TechSpec, which both require explicit logout/area-switch support. In practice, a kitchen tablet that is logged into Kitchen 1 cannot be reassigned to Kitchen 2 or salão without manually clearing cookies outside the product, so the “persistent shift session” becomes an operational lock instead of a convenience.

Add an explicit `Trocar área` or `Encerrar sessão` action on every protected surface that posts to `/api/access/logout` and then routes to `/access?reason=signed_out`. If you prefer to keep the access page as the switch point, it also needs a deliberate switch mode so `/access` does not auto-redirect an already-authenticated device before the operator can change areas.

## Triage

- Decision: `valid`
- Root cause: a página `/access` redireciona imediatamente qualquer sessão válida para a área canônica e nenhuma superfície protegida expõe uma ação de logout/troca de área. Em dispositivo compartilhado, isso prende o tablet na área ativa até alguém limpar o cookie manualmente.
- Fix approach: adicionar uma ação explícita de `Trocar área`/`Encerrar sessão` nas superfícies protegidas que faça `POST /api/access/logout` e navegue para `/access?reason=signed_out`, preservando o fluxo operacional esperado para reatribuição de tablets.
- Scope note: embora o issue esteja ancorado em `app/access/page.tsx`, o defeito concreto está nos clientes protegidos. O fix exigirá tocar `src/components/kds/dashboard-client.tsx`, `src/components/kds/salon-client.tsx`, `src/components/kds/order-detail-client.tsx` e testes relacionados fora da lista primária de código.
- Implemented: adicionei o componente compartilhado `AreaSwitchButton` nas três superfícies protegidas, com `POST /api/access/logout` seguido de navegação para `/access?reason=signed_out&mode=switch`. A página `/access` agora aceita `mode=switch` para não auto-redirecionar uma sessão ainda válida durante a troca deliberada de área.
- Verification: `npm run lint` passou; `npm run test:run -- app/access/page.test.ts app/api/orders/mutations.test.ts src/components/kds/production-client-contracts.test.ts` passou com 18 testes; `npm run build` passou. A suíte completa `npm run test:run` segue falhando por um teste documental preexistente e não relacionado em `src/application/live-integration-docs.test.ts` que espera a referência `qa/live-integration-post-qa-checklist.md` dentro de `docs.verificationReport`.
