# Sistema de Estoque

## O que será criado

### 1. Banco de dados (novas tabelas)

- **stock_groups** (global, gerenciado só pelo admin): `name`, `is_active`, `sort_order`. Pré-popula com **Coxinhas**, **Churros**, **Bebidas**.
- **restaurant_stock**: saldo por restaurante e por grupo (`restaurant_id`, `group_id`, `quantity`, `updated_at`). Único por (restaurante, grupo).
- **stock_movements**: histórico de toda entrada/saída (`restaurant_id`, `group_id`, `quantity` (+/-), `type` (`supply_delivery`, `order_consumption`, `manual_adjust`), `reference_id`, `notes`, `created_by`).
- **supply_products.stock_group_id** (nova coluna): vincula cada insumo a um grupo de estoque. Quantidade do pedido entregue → entra no grupo.
- **product_stock_consumption**: vincula produto do cardápio a 1+ grupos de estoque (`product_id`, `group_id`, `quantity_per_unit`).

### 2. Regras automáticas (triggers)

- Quando `supply_orders.status` muda para **delivered**: para cada item, soma `quantity` no `restaurant_stock` do grupo vinculado ao insumo. Cria registro em `stock_movements`.
- Quando `orders.status` muda para **accepted**: para cada item do pedido, calcula `quantity * quantity_per_unit` por grupo e debita do `restaurant_stock`. Permite ficar negativo. Cria movimento.
- Reverter (somar de volta) caso o status volte de accepted para pending/cancelled.

### 3. Painel Admin → nova aba "Estoque"

- Gerenciar **grupos globais** (CRUD: criar, renomear, ativar/desativar).
- Visualizar estoque de **todas as lojas** (tabela: restaurante × grupo = quantidade, com filtro por restaurante).
- Histórico de movimentações por restaurante.
- No `SupplyAdminPanel` (cadastro de insumos): adicionar campo **Grupo de estoque** no formulário.

### 4. Dashboard do gerente → nova aba "Estoque"

- Mostra saldo atual por grupo do próprio restaurante.
- Histórico de movimentações (filtro por tipo/data).
- Botão **Ajuste manual** (corrige saldo, vai para o histórico).
- Aviso visual em vermelho quando saldo ≤ 0.

### 5. Cardápio (MenuManager)

- Dentro do formulário de cada produto, nova seção **"Consumo de estoque"**:
  - Botão "Adicionar grupo" → seleciona um `stock_group` + define `quantity_per_unit`.
  - Permite múltiplos grupos (ex: combo "50 coxinhas + bebida" → 50 Coxinhas + 1 Bebida).

## Detalhes técnicos

- Todas as tabelas com RLS:
  - `stock_groups`: leitura para autenticados, escrita só `master_admin`.
  - `restaurant_stock` / `stock_movements`: leitura/escrita para `is_restaurant_manager` ou `master_admin`.
  - `supply_products.stock_group_id`: nullable (insumos antigos não quebram).
  - `product_stock_consumption`: gerenciado pelo manager do restaurante dono do produto.
- Triggers em `SECURITY DEFINER` para garantir gravação independente de RLS do usuário.
- Decisão confirmada: desconto **ao aceitar o pedido**; estoque pode ficar negativo (apenas avisa).

## Arquivos a alterar/criar

- Migração SQL (novas tabelas + colunas + triggers + RLS + seed dos 3 grupos).
- `src/components/dashboard/AppSidebar.tsx` — item "Estoque".
- `src/pages/ManagerDashboard.tsx` — rota da nova view.
- `src/components/dashboard/StockPanel.tsx` (novo) — saldo + histórico + ajuste.
- `src/components/admin/AdminSidebar.tsx` + `src/pages/MasterAdmin.tsx` — aba "Estoque".
- `src/components/admin/AdminStockPanel.tsx` (novo) — grupos globais + visão geral todas lojas.
- `src/components/admin/SupplyAdminPanel.tsx` — campo "Grupo de estoque".
- `src/components/dashboard/MenuManager.tsx` — seção "Consumo de estoque" no produto.

Ao aprovar, começo pela migração e sigo na sequência acima.