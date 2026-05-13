# Task Memory: task_02.md

Keep only task-local execution context here. Do not duplicate facts that are obvious from the repository, task file, PRD documents, or git history.

## Objective Snapshot
- Entregar o entry flow `/access` com seleção de área, PIN por ambiente, redirect automático para sessões válidas e handlers de login/logout baseados na infraestrutura do task 01.

## Important Decisions
- O redirect pós-login continuará server-owned via `POST /api/access/session`, com a UI apenas consumindo `redirectTo` retornado pelo handler.
- A page `/access` vai validar a sessão existente no servidor e redirecionar apenas para a home canônica da área (`/` ou `/salon`), conforme o TechSpec.
- `POST /api/access/logout` vai limpar o cookie com a infraestrutura compartilhada sem depender do secret completo, para manter logout/troca de área determinísticos mesmo se a configuração de PIN estiver ausente.
- Os testes de integração do fluxo ficarão divididos entre Vitest server-side para o redirect da page e Playwright para o login com `next` normalizado e regressão real do navegador.
- A page `/access` trata configuração ausente como estado operacional visível na UI, em vez de quebrar o render; o handler continua respondendo `503` para manter o contrato HTTP.

## Learnings
- `cookies()` em Next 16 é assíncrono neste workspace (`Promise<ReadonlyRequestCookies>`), então a page `/access` precisa tratar leitura de cookie via `await cookies()`.
- O repositório já tem a allowlist e a normalização de `next` prontas em `createAreaAccessService().resolveNextTarget`, então o task 02 não precisa reinventar política de redirect.
- O E2E local precisava receber `BISTRO_ACCESS_*` no `playwright.config.ts`; sem isso, o novo fluxo de login falha em `503` mesmo com o modo mock do provider.

## Files / Surfaces
- `app/access/page.tsx`
- `app/api/access/session/route.ts`
- `app/api/access/logout/route.ts`
- `src/components/access/access-entry-form.tsx`
- `app/access/page.test.ts`
- `app/api/access/session/route.test.ts`
- `app/api/access/logout/route.test.ts`
- `playwright.config.ts`
- `src/infrastructure/playwright-config.test.ts`
- `e2e/access-flow.spec.ts`
- `e2e/dashboard-smoke.spec.ts`
- `README.md`

## Errors / Corrections
- Os caminhos globais assumidos inicialmente para `cy-execute-task` e `cy-final-verify` não existiam; as versões instaladas foram localizadas em `/Users/admin/Desktop/dev/go/compozy/skills/`.

## Ready for Next Run
- Task 03 can consume the issued cookie contract directly in protected read APIs without adding another auth entry point.
- Task 04 can wire page guards to `/access` and reuse the page's existing valid-session redirect plus optional reason-based messaging.
- Task 07 can add operator-facing logout or switch-area controls on top of `POST /api/access/logout`.
