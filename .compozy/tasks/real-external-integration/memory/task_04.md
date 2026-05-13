# Task Memory: task_04.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Implementado o serviço de orquestração de sync provider-agnostic para webhook, reconciliação e replay, com deduplicação por evento, contabilização de `sync_runs`, lifecycle de exceções e preservação das entidades de produção após import.

## Important Decisions
- O novo fluxo de integração foi isolado em `src/application/provider-sync-service.ts`; `src/application/order-sync-service.ts` permanece como importador legado para seed/mock startup e não participa do live sync.
- Ordens já importadas são detectadas primeiro por `provider_orders.imported_order_id` e, em fallback, por `orders.external_id`, para manter a compatibilidade com imports legados que ainda não tinham sync state persistido.
- Divergências `changed_externally` preservam um baseline compacto dentro de `details.baseline`, permitindo resolver mudanças de modificador e nota mesmo depois que `provider_orders.normalized_json` é atualizado com snapshots mais novos.
- Webhooks duplicados só são tratados como `duplicate_ignored` antes da criação do `sync_run`; qualquer falha posterior segue como erro real de aplicação e marca o run/evento como `failed`.

## Learnings
- `ingestion_failed` pode nascer com `order_id` nulo ou preenchido; a resolução automática em replay bem-sucedido precisa varrer exceções não resolvidas por `external_order_id`, não apenas pelo par exato com `order_id = null`.
- O comparador de divergência precisa olhar tanto para o agregado importado quanto para o baseline do snapshot anterior/exceção para cobrir mudanças de quantidade, item, nota e modificadores sem mutar a produção.
- O resultado do serviço passou a carregar `status` em webhook e replay/reconciliation (`completed | failed`), além de `errorCount` no run, para que as rotas decidam `200` vs `500` sem inferir pelo tipo de exceção.

## Files / Surfaces
- `src/application/provider-sync-service.ts`
- `src/application/provider-sync-service.test.ts`
- `src/domain/provider-sync.ts`

## Errors / Corrections
- Corrigido o fluxo de build para evitar nulidades indevidas em `reconcileConfirmedOrders` e no comparador de divergência.
- Corrigido o `catch` do webhook para não mascarar `UNIQUE` tardio como delivery duplicado depois que o `sync_run` já existe.
- A suíte foi expandida para subir o branch coverage global acima da meta de 80%.

## Ready for Next Run
- Task 05 pode instanciar `createProviderSyncService()` e usar `WebhookProcessResult.status` para responder `500` apenas quando o sync técnico falhar, mantendo `200` para import, ignorados e exceções operacionais.
- Task 05 também pode reutilizar `SyncRunResult.status` e `errorCount` para a rota interna de reconciliação/replay sem duplicar contagem de run.
