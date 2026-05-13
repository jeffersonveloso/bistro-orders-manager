---
provider: manual
pr:
round: 3
round_created_at: 2026-05-11T21:24:52Z
status: resolved
file: src/application/provider-sync-service.ts
line: 1389
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Replay cap starves older imported orders forever

## Review Comment

The bounded replay fix now sorts imported replay candidates by `selectReplayCursor(state)`, and that cursor prefers `lastAppliedAt` over `lastSeenAt`. The problem is that every replayed imported order rebuilds its provider state with `lastAppliedAt = context.syncedAt` in `buildProviderOrderState()`, including the branch where the order is already canceled externally and no new production import happens.

With more than `DEFAULT_RECONCILIATION_REPLAY_LIMIT` imported orders outside `confirmed_ready`, this turns the cap into a starvation loop:

1. the first reconciliation picks the newest `50` replay candidates;
2. replaying those candidates bumps their `lastAppliedAt` to "now";
3. the next reconciliation sorts by that refreshed timestamp again and picks the same `50`.

Older replay candidates never age into the bounded window, so a lost cancel/change webhook for one of those orders can remain undiscovered indefinitely. Because the self-refreshed `lastAppliedAt` also becomes the replay filter input, those same stale orders can keep re-entering later `updatedSince` windows even when the provider has not changed anything. That breaks the intended "scheduled reconciliation as safety net" behavior from ADR-004 once historical backlog exceeds the cap.

The fix needs a stable progression signal for replay fairness. Pragmatic options:

- sort capped replay work by `lastSeenAt` or another provider-origin timestamp that is not refreshed by the replay itself;
- persist a dedicated replay cursor / queue so each bounded run advances through the backlog instead of restarting from the same top slice;
- keep `lastAppliedAt` for audit only, but do not use it as the ordering key for replay candidate selection.

The current tests cover a single bounded run, but they do not assert that a second reconciliation advances to older backlog entries. Add a regression that runs reconciliation twice and verifies the second pass reaches previously unprocessed imported orders.

## Triage

- Decision: `VALID`
- Root cause: `listReplayExternalOrderIds()` usa um único cursor (`lastAppliedAt ?? lastSeenAt`) tanto para filtrar por `updatedSince` quanto para ordenar o backlog capped. Como cada replay atualiza `lastAppliedAt` para `context.syncedAt`, os pedidos já reprocessados voltam imediatamente ao topo do slice limitado e o backlog histórico fora do cap nunca progride.
- Fix approach: separar as responsabilidades do cursor. O filtro temporal do replay deve usar um timestamp estável de origem do provider (`lastSeenAt`) para que uma reconciliação não se autoamplie por ter acabado de reprocessar o pedido. A ordenação de fairness deve usar o último apply local (`lastAppliedAt` com fallback para `lastSeenAt`) em ordem crescente, para que os pedidos menos recentemente reconciliados avancem primeiro a cada rodada bounded. Também vou adicionar uma regressão de duas reconciliações consecutivas validando que a segunda execução alcança pedidos que ficaram fora da primeira janela capped.
- Resolution: `src/application/provider-sync-service.ts` agora separa o cursor de filtro (`lastSeenAt`) do cursor de prioridade do replay. Reconciliações com `updatedSince` continuam priorizando recência observada do provider, mas a safety net ampla capped passou a ordenar o backlog pelo `lastAppliedAt` mais antigo para rotacionar o trabalho entre execuções. A regressão em `src/application/provider-sync-service.test.ts` agora executa duas reconciliações bounded consecutivas e prova que a segunda rodada alcança pedidos históricos que ficaram fora da primeira.
- Verification:
  - `npm run test:run -- src/application/provider-sync-service.test.ts` ✅ (`1` arquivo, `17` testes)
  - `npm run lint` ✅
  - `npm run test:run -- --coverage` ✅ (`15` arquivos, `90` testes)
  - `npm run build` ✅
  - `npm run test:e2e` ❌ com falhas pré-existentes e fora do escopo deste batch em `e2e/api-contract.spec.ts`, `e2e/dashboard-smoke.spec.ts`, `e2e/order-detail.spec.ts` e `e2e/salon-sync-exceptions.spec.ts`, todas ligadas às superfícies seeded de board/detalhe/salão e não ao arquivo corrigido `src/application/provider-sync-service.ts`.
