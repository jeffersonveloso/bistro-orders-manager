---
provider: manual
pr:
round: 2
round_created_at: 2026-05-11T21:05:48Z
status: resolved
file: src/application/provider-sync-service.ts
line: 236
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Reconciliation replays all historical imported orders

## Review Comment

The fix for lost-cancellation recovery now appends every imported order whose external ID is not in the provider's current confirmed listing:

- `reconcileConfirmedOrders()` fetches confirmed candidates with `limit` / `updatedSince`
- then it adds `options.repository.listImportedExternalOrderIds()` wholesale, filtering only by absence from the confirmed set

That creates two linked problems:

1. The reconciliation contract no longer respects its own scoping inputs. A caller can pass a narrow `updatedSince` or `limit`, but the service will still fetch and process every historical imported order that has already left `confirmed_ready`.
2. The scheduler workload now grows monotonically with order history. Any canceled or otherwise no-longer-confirmed imported order is re-fetched on every reconciliation forever, which can make the safety-net increasingly expensive and delay the fast detection targets from the PRD.

This is a new regression relative to the previous implementation. The recovery fix needs a bounded replay set, not `all imported orders ever`. A pragmatic correction is to scope replay candidates by sync metadata such as `provider_orders.last_seen_at` / `last_applied_at`, unresolved exception state, or the same reconciliation window used for `updatedSince`, and to enforce `limit` across the combined candidate set instead of only the confirmed-provider subset.

## Triage

- Decision: `VALID`
- Root cause: a reconciliação passou a concatenar `listImportedExternalOrderIds()` inteira ao lote confirmado do provider, então o replay ignora o escopo temporal de `updatedSince`, ignora o orçamento de `limit` depois do fetch inicial e cresce indefinidamente com o histórico local.
- Fix approach: selecionar candidatos de replay apenas entre pedidos importados fora da listagem confirmada atual, ordenando-os por metadados já persistidos em `provider_orders` (`last_applied_at` com fallback para `last_seen_at`), filtrando pelo mesmo corte de `updatedSince` quando ele existir e aplicando um limite efetivo ao replay: orçamento remanescente quando o chamador informar `limit`, ou um cap interno fixo quando a reconciliação ampla não informar limite. Vou cobrir isso com regressões no serviço para janela temporal, limite combinado e replay bounded.
- Resolution: `reconcileConfirmedOrders()` agora deriva o replay a partir do estado sincronizado em `provider_orders`, deduplica por `externalOrderId`, filtra por `updatedSince`, respeita o orçamento remanescente de `limit` e aplica um cap interno de `50` replays quando a reconciliação ampla não informa limite. A regressão ficou coberta em `src/application/provider-sync-service.test.ts` com cenários para janela temporal + limite combinado e para replay bounded de histórico.
- Verification:
  - `npm run lint` ✅
  - `npm run test:run -- --coverage` ✅ (`15` arquivos, `90` testes)
  - `npm run build` ✅
  - `npm run test:run -- app/api/provider-sync-routes.test.ts src/application/provider-sync-service.test.ts src/application/production-service.test.ts` ✅ (`3` arquivos, `34` testes)
  - `npm run test:e2e` ❌ com falhas pré-existentes e fora do escopo deste batch em `e2e/api-contract.spec.ts`, `e2e/dashboard-smoke.spec.ts`, `e2e/order-detail.spec.ts` e `e2e/salon-sync-exceptions.spec.ts`, todas ligadas às superfícies seeded de board/detalhe/salão e não ao arquivo corrigido `src/application/provider-sync-service.ts`.
