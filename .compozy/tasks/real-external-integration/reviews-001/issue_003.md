---
provider: manual
pr:
round: 1
round_created_at: 2026-05-11T20:23:35Z
status: resolved
file: src/application/provider-sync-service.ts
line: 241
severity: medium
author: claude-code
provider_ref:
---

# Issue 003: List failures never create a reconciliation run

## Review Comment

`reconcileConfirmedOrders()` calls `provider.listConfirmedOrders()` before it persists a `sync_runs` row. Any upstream list failure, adapter parse error, or invalid `updatedSince` value therefore aborts the request before there is any local audit record of the reconciliation attempt.

That weakens the operational traceability this feature is supposed to add. The TechSpec introduces `sync_runs` specifically so webhook intake and scheduled reconciliation leave durable bookkeeping, but the most important reconciliation failure mode currently disappears unless somebody is watching external logs in real time.

Start the run before fetching candidates, keep `candidateCount` provisional until the list succeeds, and mark the run as `failed` if prefetching candidates throws. That preserves a durable local trail for scheduler outages and upstream contract regressions.

## Triage

- Decision: `VALID`
- Root cause: `reconcileConfirmedOrders()` só cria `sync_runs` depois de `provider.listConfirmedOrders()`. Qualquer falha de listagem, parse do adapter ou parâmetro inválido aborta a execução antes de existir rastreabilidade local da tentativa.
- Fix approach: abrir o `sync_run` antes do prefetch com `candidateCount` provisório e, se a listagem falhar, finalizar o run como `failed` com `errorCount` incrementado. Quando a listagem concluir, atualizar o `candidateCount` real na finalização normal do run.
- Resolution: `sync_runs` agora é criado antes do prefetch de candidatos e é finalizado como `failed` quando a listagem do provider falha, preservando trilha de auditoria local. A regressão foi coberta com um teste que força falha em `listConfirmedOrders()`.
