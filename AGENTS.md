Implemente um MVP funcional de um sistema de produção para o bistrô “Vó Ziluca” em Next.js, com foco em operação real de cozinha, separação automática de itens por cozinha e acompanhamento sincronizado dos pedidos.

Contexto
O bistrô possui 2 cozinhas físicas separadas por uma parede. Hoje os pedidos em papel causam atraso, erro de leitura e falta de sincronismo. O sistema deve dividir automaticamente os itens do pedido por cozinha, permitir que cada cozinha acompanhe sua parte e também visualize o andamento da outra, para que o pedido seja entregue completo ao mesmo tempo.

Stack obrigatória
- Next.js com App Router
- shadcn/ui
- Tailwind CSS
- Radix UI
- Lucide Icons
- TanStack Query para cache/estado assíncrono de pedidos
- SQLite para persistência local

Integração externa
- Plataforma de pedidos: https://anota-ai.stoplight.io/docs/api-de-pedidos/udio7jx7jg0dz-portal-de-integracao
- Não acople o domínio diretamente à API externa.
- Crie uma camada de integração/adaptação para permitir troca futura de provedor.
- Se a integração real não for concluída no MVP, implemente um adapter mockado bem isolado, com interface compatível para substituição futura.

Requisitos funcionais
1. O sistema deve considerar 2 cozinhas:
- Cozinha 1
- Cozinha 2

2. Cada item do cardápio deve pertencer a uma cozinha.

3. Quando um pedido chegar, os itens devem ser divididos automaticamente por cozinha.
Exemplo:
- Pedido 01
- Croissant qtd 2
- Café gelado qtd 2
- Suco de laranja qtd 1
Resultado:
- Cozinha 1: Café gelado, Suco de laranja
- Cozinha 2: Croissant

4. Criar um painel principal em estilo Kanban para produção.
- Exibir os pedidos por cozinha
- Exibir colunas de status, por exemplo:
  - Novo
  - Em preparo
  - Pronto
- A interface deve ser legível à distância e rápida de operar em ambiente de cozinha

5. Ao clicar em um pedido, abrir uma tela de detalhe ocupando 100% da tela.
Nessa tela, a cozinha deve ver:
- Seus itens em destaque
- Os itens da outra cozinha
- O status da sua produção
- O status da outra cozinha
Objetivo: sincronizar a entrega final dos itens do mesmo pedido.

6. Criar ações rápidas para operação.
- Permitir mudança rápida de status
- Escolha componentes adequados para toque/clique rápido
- Exemplos:
  - Iniciar preparo
  - Marcar item como pronto
  - Marcar produção da cozinha como concluída

7. Criar uma tela resumida para o salão/atendimento.
Exibir:
- Identificação do pedido
- Nome ou referência do cliente, se existir
- Status geral consolidado do pedido
Essa tela não precisa expor detalhes internos da cozinha.

Arquitetura obrigatória
Aplique Clean Code e Clean Architecture.
Separe claramente as camadas:
- domínio
- aplicação
- infraestrutura
- interface/UI

Crie uma camada interna de controle de pedidos para desacoplar o sistema da plataforma externa.
O sistema deve depender de interfaces internas, não da API do provedor.

Modelo de domínio esperado
Estruture algo próximo disso:
- Order
- OrderItem
- Kitchen
- KitchenTicket ou ProductionTicket
- ProductionStatus
- MenuItemKitchenMapping
- SplitOrderService
- OrderSyncService

Requisitos técnicos
- Use App Router
- Use SQLite
- Crie seed de dados para demonstração
- O sistema deve funcionar mesmo sem integração real, usando dados mockados ou seedados
- A UI deve funcionar bem em desktop e tablet
- Priorize legibilidade, velocidade operacional e baixo atrito de uso

Entregáveis
1. Projeto funcional rodando localmente
2. Estrutura coerente com Clean Architecture
3. Banco SQLite configurado
4. Seed de dados
5. Painel Kanban das cozinhas
6. Tela full screen de detalhe do pedido
7. Tela resumida para o salão
8. README com instruções de execução e resumo da arquitetura

Critérios de aceitação
- Pedidos com itens de cozinhas diferentes devem ser divididos corretamente
- Cada cozinha deve ver sua parte como foco principal
- Na tela de detalhe, cada cozinha também deve visualizar o andamento da outra
- Deve ser possível alterar status rapidamente
- O status consolidado do pedido deve refletir o estado das duas cozinhas
- O código deve estar organizado, legível e desacoplado do provedor externo

Instruções de execução
- Primeiro, inspecione o repositório atual e entenda o que já existe
- Se o repositório estiver vazio, faça o scaffold completo do projeto
- Tome decisões pragmáticas quando algo não estiver especificado
- Não pare apenas em planejamento: implemente a solução end-to-end
- Ao final, rode os comandos necessários para validar que o projeto sobe localmente
- Documente no README as decisões arquiteturais e o que ficou mockado
- Preserve boas práticas de organização, nomenclatura e separação de responsabilidades
