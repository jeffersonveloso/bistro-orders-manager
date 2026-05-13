---
provider: manual
pr:
round: 1
round_created_at: 2026-05-13T16:29:36Z
status: resolved
file: app/api/orders/[orderId]/items/[itemId]/route.ts
line: 76
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: Malformed JSON yields 500 on protected order mutations

## Review Comment

This route parses the request body with `await request.json()` and does not catch `SyntaxError`. The sibling kitchen-ticket route does the same at `app/api/orders/[orderId]/tickets/[kitchenId]/route.ts:73`. A syntactically invalid JSON body therefore escapes the handler and becomes a server error instead of a deterministic client error.

That is inconsistent with the rest of the hardening slice: access and catalog handlers already use the shared JSON-reading helper to turn malformed payloads into `400` responses. Leaving the protected order mutations as uncaught `request.json()` calls means a bad request at a system boundary produces a `500` on a live operational endpoint and skips the predictable error contract the rest of the feature established.

Use the same shared JSON parsing helper that the other routes use, or catch `SyntaxError` explicitly and return `400`. Apply the change to both protected mutation routes and add tests that send raw invalid JSON to confirm they fail as client errors instead of crashing the handler.

## Triage

- Decision: `valid`
- Root cause: as duas rotas protegidas de mutação usam `await request.json()` diretamente. Quando o corpo contém JSON malformado, o `SyntaxError` escapa do handler e vira `500`, quebrando o contrato de erro de cliente já adotado no restante da camada HTTP.
- Fix approach: trocar o parsing cru pelo helper compartilhado `readJsonObject()` nas duas rotas de mutação e cobrir com testes que enviem payload bruto inválido para confirmar `400` determinístico.
- Implemented: ambas as rotas protegidas de mutação agora usam `readJsonObject()` e retornam `400 "Invalid JSON body"` para payloads malformados, alinhando o contrato HTTP com o restante da camada de acesso.
- Verification: foi adicionada uma regressão que envia JSON bruto inválido para os dois endpoints em `app/api/orders/mutations.test.ts`; `npm run lint`, a suíte direcionada e `npm run build` passaram. A única falha restante em `npm run test:run` está fora deste escopo, no teste documental `src/application/live-integration-docs.test.ts`.
