---
provider: manual
pr:
round: 2
round_created_at: 2026-05-13T16:48:07Z
status: resolved
file: app/api/orders/[orderId]/items/[itemId]/route.ts
line: 49
severity: medium
author: claude-code
provider_ref:
---

# Issue 001: Item mutation masks unexpected failures as 404

## Review Comment

The new protected item-mutation route still converts every exception from `setOrderItemStatus()` into `404` by catching `error` broadly and returning `jsonNoStore(String(error), { status: 404 })`.

That means the route no longer distinguishes “item not found” from genuine operational failures such as a repository error, a closed SQLite handle, or a future port implementation throwing for another reason. In those cases the API will misreport the problem as a missing resource, which makes production debugging harder and gives the client the wrong contract.

Handle only the not-found case as `404` and let unexpected failures surface as `500` (or map them explicitly if you introduce a typed domain error). A small fix is to use a dedicated `NotFound` error from the repository or to inspect a narrow sentinel condition before returning `404`, instead of catching all errors indiscriminately.

## Triage

- Decision: `VALID`
- Root cause: `handlePatchOrderItem()` captura qualquer excecao de `setOrderItemStatus()` e converte tudo em `404`, mesmo quando a falha nao representa ausencia do recurso.
- Fix approach: usar o agregado ja carregado pela rota para retornar `404` apenas quando `order` ou `item` realmente nao existirem, e tratar o fallback de corrida com uma verificacao estreita de erro de item inexistente. Qualquer outra excecao deve retornar `500` para preservar o contrato operacional correto.

## Resolution

- Implementado pre-check explicito para `order` e `item` inexistentes na rota e no handler, mantendo `404` apenas para ausencia real do recurso.
- Implementado fallback estreito para a condicao de corrida em que o repositorio ainda pode retornar `Order item "<id>" not found` durante a mutacao.
- Qualquer falha inesperada do repositorio agora retorna `500` em vez de ser mascarada como `404`.
- Regressao adicionada em `app/api/orders/mutations.test.ts` para cobrir:
  - `404` quando o pedido nao existe
  - `404` quando o item nao existe
  - `500` quando o repositorio falha de forma inesperada

## Verification

- `npm run test:run -- app/api/orders/mutations.test.ts` -> `PASS` (`1` arquivo, `16` testes)
- `npm run lint` -> `PASS`
- `npm run test:run -- --coverage` -> `FAIL` por causa de `src/application/live-integration-docs.test.ts`, que espera a string `qa/live-integration-post-qa-checklist.md` dentro de `qa/verification-report.md`; este teste documental nao toca a rota corrigida nem arquivos alterados neste batch
- `npm run build` -> `PASS`
- `npm run test:e2e` -> `PASS` (`13` testes)
