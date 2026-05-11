---
provider: manual
pr:
round: 1
round_created_at: 2026-05-11T20:23:35Z
status: resolved
file: src/application/provider-sync-service.ts
line: 185
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Failed webhook retries are treated as duplicates

## Review Comment

When `recordInboundEvent()` hits the unique `(provider, delivery_key)` constraint, `handleWebhook()` immediately returns `duplicate_ignored` as long as the duplicate happened before a new `sync_run` was created. That shortcut never checks whether the original delivery actually succeeded.

This breaks the common retry path for transient failures. If the first webhook attempt opened `ingestion_failed` because canonical fetch or normalization failed, a provider retry with the same delivery key is discarded even though nothing was imported yet. Recovery is then delayed until some later reconciliation instead of happening on the fast webhook path. The current tests only cover duplicate deliveries after a successful import, so this failure mode stays invisible.

Treat duplicate delivery keys as idempotent only after the stored event is already `processed`. If the existing event is still `failed`, the retry should re-run the sync or resume from the persisted event payload instead of short-circuiting to `duplicate_ignored`. The repository-side uniqueness in `src/infrastructure/sqlite.ts` is correct for deduplication, but the service needs to branch on prior event outcome before deciding the request is safely ignorable.

## Triage

- Decision: `VALID`
- Root cause: o `catch` de violação de unicidade em `handleWebhook()` trata qualquer colisão de `(provider, delivery_key)` como duplicata segura e retorna `duplicate_ignored` antes de consultar o resultado do evento já persistido. Com isso, retries de webhooks que falharam tecnicamente nunca reexecutam o sync rápido.
- Fix approach: consultar o evento já salvo por `(provider, deliveryKey)` quando houver colisão. Se o evento anterior já estiver `processed`, manter `duplicate_ignored`; se estiver `failed` ou ainda não concluído, iniciar um novo `sync_run` reutilizando o `sourceEventId` existente e reexecutar a sincronização. Isso exige ampliar minimamente a porta/repositório para lookup do evento persistido, apesar de o lote ter como foco principal `provider-sync-service.ts`.
- Resolution: o serviço agora busca o evento persistido por `deliveryKey`, ignora apenas duplicatas já `processed` e reexecuta o sync quando o evento anterior ficou `failed`/incompleto, reutilizando o mesmo `sourceEventId`. O suporte de lookup foi adicionado na porta/repositório SQLite e coberto por teste de retry com o mesmo `deliveryKey`.
