# Estoque do admin (fábrica) — grupos e subgrupos

## Objetivo
Criar um controle de estoque próprio do admin/fábrica, organizado em **grupos** e **subgrupos**, alimentado manualmente, e que seja debitado automaticamente quando um pedido de insumo de algum restaurante for marcado como "entregue".

## 1. Submenu na aba Estoque (admin)
No `AdminStockPanel` atual, adicionar uma terceira aba:
- "Estoque das lojas" (já existe)
- "Grupos de itens" (já existe — estoque das lojas)
- **NOVO** "Estoque admin" — gestão da fábrica

## 2. Estrutura de dados (novas tabelas)

```
admin_stock_groups
  id, name, sort_order, is_active

admin_stock_subgroups
  id, group_id (FK), name, sort_order, is_active
  quantity (int, manual)         -- estoque atual desse sabor/variação

admin_stock_movements
  id, subgroup_id, quantity (+/-), type, reference_id, notes, created_at, created_by
  (tipos: manual_set, manual_add, manual_subtract, supply_delivery)
```

RLS: somente master_admin pode CRUD/ler.

## 3. Vínculo no catálogo de insumos
No formulário de "Novo/Editar insumo" (`SupplyCatalogTab`), **manter** os campos atuais (grupo de estoque do restaurante + categoria de despesa) e **adicionar**:

- Campo "Grupo do estoque admin" (select com os grupos da fábrica)
- Se o insumo tiver "Quantidade limitadora" ativada (subgrupos/sabores), cada **opção** (sabor) passa a ser linkada a um **subgrupo do estoque admin** ao invés de ser apenas texto livre.

Schema:
```
supply_products: + admin_stock_group_id uuid null
supply_product_options: + admin_stock_subgroup_id uuid null
```

O campo "opções" do pedido de insumo continua existindo (UX no pedido), mas agora cada opção referencia um subgrupo real.

## 4. Dedução automática
Estender o trigger `handle_supply_order_delivered`:
Quando um pedido vira `delivered`:
- Para cada item com `admin_stock_group_id` mas sem subgrupos: debita `quantity * total_quantity` do(s) subgrupo(s)? **Não** — se não há subgrupo, pulamos (admin não controla nesse nível).
- Para cada item com opções (`supply_order_item_options`) cujo `admin_stock_subgroup_id` esteja vinculado: debita `option.quantity` do subgrupo correspondente, registrando movimento `supply_delivery` com `reference_id = supply_order_id`.

## 5. UI da aba "Estoque admin"
- Lista de grupos (com botão "Novo grupo")
- Cada grupo expande mostrando seus subgrupos com:
  - Nome
  - Quantidade atual (destaque)
  - Botões: + somar, − subtrair, ✎ definir total
  - Cada ação abre um diálogo simples e registra em `admin_stock_movements`
- Total por grupo no cabeçalho

## 6. Arquivos
- **Migration** (nova) — tabelas + colunas + trigger atualizado + RLS
- `src/components/admin/AdminStockPanel.tsx` — adiciona aba "Estoque admin"
- `src/components/admin/AdminStockAdmin.tsx` (novo) — CRUD grupos/subgrupos + ajustes manuais
- `src/components/admin/SupplyAdminPanel.tsx` — adiciona selects de grupo admin (no produto) e subgrupo admin (em cada opção/sabor)

## Notas
- O campo "opções" continua exibindo o nome (sabor) no pedido — sem regressão visual no fluxo do restaurante.
- O cardápio do restaurante (que produtos consomem do estoque dele) não muda.
- Pedidos antigos sem vínculo de subgrupo simplesmente não debitam (sem erro).
