# Task Memory: task_06.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Expor exceções de sync nas read models e nas três superfícies operacionais existentes sem mudar semântica de status de cozinha.
- Manter exceções `acknowledged` visíveis como não resolvidas até replay/reconciliation, incluindo board marker, detalhe e salão.

## Important Decisions
- Implementar a `syncTrail` do detalhe como uma timeline mínima derivada dos registros de `order_sync_exceptions` (detecção, acknowledge e resolução), evitando nova tabela ou dependência de `provider_events` na UI.
- Usar um resumo curto por `kind` para marcadores visuais (`syncExceptionLabel`) e manter `summary`/timestamps completos para banner, alert strip e salão.
- Seedar exceções de demonstração apenas no runtime/local app bootstrap, não no helper padrão de testes em memória, para manter previsibilidade dos testes existentes e permitir E2E com estado visível por padrão.
- Normalizar summaries de read model para colapsar textos persistidos no formato `Pedido Pedido ...` antes de renderizar na UI.

## Learnings
- `ProductionRepository` ainda não expõe nada de sync; `production-service.ts` hoje não tem campos `syncException`, `syncTrail` ou `syncAlerts`.
- `ProviderSyncRepository` já fornece tudo o que a task precisa para leitura: exceções não resolvidas globais, por orderId e histórico por pedido.
- O Playwright já reseta `data/bistro-production.e2e.sqlite` antes de subir o app, então bastou semear exceções no `getProductionRepository()` para cobrir board, detalhe e salão com estado real.

## Files / Surfaces
- `src/application/production-service.ts`
- `src/application/production-service.test.ts`
- `src/infrastructure/sqlite.ts`
- `src/components/kds/dashboard-client.tsx`
- `src/components/kds/order-detail-client.tsx`
- `src/components/kds/salon-client.tsx`
- `e2e/dashboard-smoke.spec.ts`
- `e2e/order-detail.spec.ts`
- `e2e/salon-sync-exceptions.spec.ts`

## Errors / Corrections
- Cobertura total ficou em `78.34%` de branches no primeiro passe; corrigi com testes sintéticos adicionais de read-model presentation e rerodei `vitest --coverage` até `81.97%`.
- O primeiro passe de revisão revelou copy duplicada em summaries (`Pedido Pedido ...`); corrigi na read model e reexecutei toda a verificação.

## Ready for Next Run
- Verificação final limpa após o último patch:
  - `npm run test:run`
  - `npm run lint`
  - `npm run build`
  - `npx vitest run --coverage`
  - `npm run test:e2e`
