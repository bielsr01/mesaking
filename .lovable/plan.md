## Gestão de Acessos — Sub-usuários com permissões

Adicionar sistema completo de grupos de permissão e sub-usuários vinculados ao restaurante, com controle granular de acesso a cada aba/função do dashboard.

### 1. Backend (migração)

**Tabelas novas:**
- `access_groups` — grupos de permissão por restaurante
  - `restaurant_id`, `name`, `is_default` (gestor padrão), `permissions` (jsonb)
- `restaurant_members` — já existe; adicionar coluna `access_group_id` (nullable; null = gestor total/owner)

**Estrutura do JSONB `permissions`** (todas booleanas exceto onde indicado):
```json
{
  "overview": { "view": true },
  "orders": { "view": true, "scope": "all|ifood_only", "edit": true, "status_only": false },
  "menu": { "view": true, "edit": true },
  "customers": { "view": true, "edit": true, "delete": true, "manual_adjust": true },
  "marketing": {
    "coupons": { "view": true, "edit": true },
    "bulk": { "view": true, "edit": true }
  },
  "loyalty": {
    "view": true,
    "credit_points": true,
    "redeem_points": true,
    "rewards": { "view": true, "edit": true, "delete": true }
  },
  "settings": { "view": true },
  "supply_orders": { "view": true, "edit": true },
  "stock": { "view": true, "edit": true },
  "expenses": { "view": true },
  "finance": { "view": true }
}
```

**Função/RPC:**
- `admin_create_sub_user` (edge function) — usa service role para criar usuário no auth, atribui role `manager`, insere em `restaurant_members` com `access_group_id`
- `admin_update_sub_user` — atualiza email/nome/senha/grupo
- `admin_delete_sub_user` — remove auth.user e membership

**RLS:** apenas owner ou gestor "completo" do restaurante pode CRUD em `access_groups` e em `restaurant_members` daquele restaurante.

### 2. Frontend

**Novo submenu** em Configurações: `settings:access` → "Gestão de Acessos"

**Componente `AccessManagementPanel.tsx`:**
- Topo: botão "Cadastrar grupo" + lista de grupos do restaurante (editar/excluir)
  - Dialog: nome do grupo + checkboxes/switches de cada permissão (organizadas por seção)
  - Grupo "Gestor" criado automaticamente, marcado `is_default`, não pode ser excluído nem editado
- Abaixo: lista de usuários
  - Primeiro: owner + membros sem `access_group_id` (gestores totais) — mostra nome, email, função "Gestor"
  - Depois: sub-usuários com seu grupo
  - Botões: editar (nome/email/grupo/senha), excluir
  - Botão topo: "Cadastrar usuário" (nome, email, senha, grupo)

**Hook `usePermissions.ts`:**
- Carrega o `access_group` do usuário atual no restaurante atual
- Owner/sem grupo = todas permissões true
- Expõe `can(path)` ex: `can("orders.edit")`

**Aplicação das permissões:**
- `AppSidebar` — esconde itens não permitidos (`overview`, `orders`, `menu`, `customers`, `marketing` filhos, `loyalty`, `settings`, `supply-orders`, `stock`, `expenses`, `finance`)
- `ManagerDashboard` — bloqueia rota se sem permissão
- `OrdersPanel` — filtra para iFood-only quando scope=ifood_only; oculta editar/excluir quando status_only
- `MenuManager` — oculta botões editar/excluir/criar quando `menu.edit=false`
- `CouponsPanel` / `BulkCampaignsPanel` — oculta botões edit
- `LoyaltyPanel` — controla creditar/resgatar/recompensas conforme flags
- `CustomersPanel` — oculta editar/excluir conforme flags
- `StockPanel` — somente leitura conforme flag
- `SupplyOrderPanel` — somente leitura conforme flag

### 3. Edge Functions

- `admin-create-sub-user`, `admin-update-sub-user`, `admin-delete-sub-user` — criar/editar/remover via service role, validando que o caller é gestor do restaurante.

### 4. Seed

- Trigger ou ação no app: ao abrir o painel pela primeira vez, criar grupo "Gestor" padrão com todas as permissões = true caso não exista.

### Notas técnicas

- Owner do restaurante e membros sem `access_group_id` continuam com acesso total (compatibilidade total — nada muda para usuários atuais).
- Permissões resolvidas no client; backend protege via RLS apenas em escrita de `access_groups` e gestão de membros. Operações sensíveis (excluir pedido, editar cardápio) já têm RLS que permite qualquer manager — manter assim; restrição é por UI (consistente com pedido do usuário "se desativada não aparece").
- Senha do sub-usuário é alterada via edge function (service role).
