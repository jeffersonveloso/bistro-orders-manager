---
provider: manual
pr:
round: 1
round_created_at: 2026-05-11T20:23:35Z
status: resolved
file: src/application/provider-sync-service.ts
line: 239
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Reconciliation skips orders that left confirmed_ready

## Review Comment

`reconcileConfirmedOrders()` builds its safety-net candidate set exclusively from `provider.listConfirmedOrders()`, and the Anota adapter filters that list down to snapshots whose lifecycle is already `confirmed_ready` (`src/infrastructure/anota-ai-provider.ts`, around lines 149-153 and 183-185). That means the scheduled recovery path never re-fetches imported orders that were later canceled or otherwise moved out of the confirmed lifecycle.

In practice, if a post-import `order.canceled` or similar webhook is lost, the order stays on the kitchen board forever with no `canceled_externally` exception, because reconciliation will never ask the provider for that external order again. This contradicts ADR-004's stated role for reconciliation as the recovery path for lost or delayed webhook events and leaves one of the PRD's core exception classes undetected.

The fix needs a broader reconciliation source than "currently confirmed orders only". For Phase 1, a pragmatic option is to reconcile imported external order IDs seen since the last window, or to query the provider for recently changed orders first and only decide whether to ignore or open exceptions after fetching each canonical snapshot.

## Triage

- Decision: `VALID`
- Root cause: `reconcileConfirmedOrders()` monta a lista de candidatos apenas a partir de `provider.listConfirmedOrders()`. Como o adapter do provedor só devolve snapshots ainda em `confirmed_ready`, um pedido já importado que depois passe para `canceled` sai permanentemente do conjunto de reconciliação e nunca mais é revalidado.
- Fix approach: ampliar a malha de segurança da reconciliação para unir os snapshots atualmente confirmados com os `externalOrderId` já importados localmente via `repository.listImportedExternalOrderIds()`, fazendo deduplicação por `externalOrderId` e `fetchOrderById()` para os importados que não vierem na listagem confirmada. Isso mantém o desacoplamento do provider atual e cobre o caso de webhook perdido para cancelamento pós-importação.
- Resolution: a reconciliação agora sempre reprocessa os pedidos já importados que não aparecerem mais na listagem confirmada do provider, abrindo `canceled_externally` quando o snapshot canônico mostra saída de `confirmed_ready`. A regressão foi coberta em `src/application/provider-sync-service.test.ts`.
