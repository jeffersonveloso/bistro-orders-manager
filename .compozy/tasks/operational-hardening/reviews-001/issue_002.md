---
provider: manual
pr:
round: 1
round_created_at: 2026-05-13T16:29:36Z
status: resolved
file: app/api/orders/[orderId]/tickets/[kitchenId]/route.ts
line: 43
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Ticket PATCH reports success when no kitchen ticket exists

## Review Comment

`PATCH /api/orders/[orderId]/tickets/[kitchenId]` always returns `200 { ok: true }` once `kitchenId` and `action` parse, even when the target order or kitchen ticket does not exist. The route calls `startTicketProduction()` or `completeTicketProduction()` unconditionally, and the SQLite repository methods (`src/infrastructure/sqlite.ts`, lines 1358-1383) do not assert that any row or ticket was matched before returning.

That breaks the TechSpec contract for this endpoint, which explicitly allows `404`, and it creates a false-success path on a production mutation: a stale client, wrong order id, or direct call to an order that no longer has a ticket in that kitchen is acknowledged as successful even though no state changed.

Make the repository or route detect “no matching kitchen ticket” before reporting success. A straightforward fix is to check for a matching aggregate/ticket pair up front or verify the update affected at least one relevant row and then throw a not-found error that the route converts into `404`. Add a regression test for a missing order and for an order that exists but has no ticket in the requested kitchen.

## Triage

- Decision: `valid`
- Root cause: `handlePatchKitchenTicket()` aceita `orderId`/`kitchenId` válidos sintaticamente e chama a mutação sem comprovar que existe um agregado para o pedido nem um ticket para a cozinha solicitada. O repositório também não acusa `0` linhas alteradas nesse fluxo, então a rota responde sucesso falso.
- Fix approach: validar o agregado e a presença do kitchen ticket antes de mutar, retornando `404` quando o pedido não existir ou quando a cozinha solicitada não fizer parte do pedido. Adicionar regressões para ambos os cenários.
- Implemented: `PATCH /api/orders/[orderId]/tickets/[kitchenId]` agora valida a existência do pedido e do ticket da cozinha antes de iniciar/concluir produção, retornando `404` para `Order not found` e `Kitchen ticket not found` em vez de `200 { ok: true }`.
- Verification: as regressões de rota para pedido ausente e ticket ausente foram adicionadas em `app/api/orders/mutations.test.ts`; `npm run lint`, a suíte direcionada e `npm run build` passaram. `npm run test:run` continua com uma única falha documental preexistente em `src/application/live-integration-docs.test.ts`, sem relação com esta mutação.
