# Plano — Edge function para copiar dados para Supabase externo

## Objetivo
Criar uma edge function `db-export-to-external` que, recebendo a **connection string Postgres do destino**, lê todas as tabelas do schema `public` daqui e insere lá. Schema já existe no destino (você confirmou).

## Como vai funcionar

1. Você abre uma tela no Master Admin → cola a connection string do destino → clica "Copiar dados".
2. A função:
   - Conecta no destino via `postgres` client do Deno (`https://deno.land/x/postgresjs`).
   - Lista todas as tabelas de `public` daqui (via service role local).
   - Para cada tabela, lê em páginas de 500 linhas e dá `INSERT ... ON CONFLICT (id) DO NOTHING` no destino (idempotente — pode rodar de novo sem duplicar).
   - Desabilita triggers no destino durante o insert (`session_replication_role = replica`) pra não disparar `handle_order_stock`, `enqueue_evolution_message_for_order`, etc.
   - Retorna JSON com contagem copiada por tabela + erros.

## Ordem de cópia (respeita dependências lógicas)
```
profiles, user_roles, restaurants, restaurant_members, access_groups,
expense_categories, admin_stock_groups, admin_stock_subgroups,
categories, option_groups, option_items, products, product_stock_consumption,
customers, coupons,
loyalty_settings, loyalty_members, loyalty_rewards, loyalty_transactions,
supply_products, supply_product_options, supply_orders, supply_order_items, supply_order_item_options,
expenses, admin_expenses,
ifood_fee_settings, ifood_sales, ihub_integrations, ihub_events,
evolution_integrations, evolution_message_templates, evolution_message_queue,
restaurant_stock, stock_movements, admin_stock_movements,
orders, order_items, order_item_options, order_status_history, order_suggestions,
cash_register_sessions, cash_movements, cash_withdrawals, operator_logs,
payment_reconciliation, bulk_campaigns, bulk_campaign_recipients
```
(a função descobre dinamicamente, essa ordem é fallback)

## Limitações importantes (vou avisar na UI)
- **Timeout 150s por invocação.** Se tiver muito dado (ex.: `orders` grande), a função roda em "modo retomar": você passa `?only=orders&offset=10000` e ela continua de onde parou. Vou expor um botão "Continuar" se ficar incompleto.
- **`auth.users` NÃO é copiado** — edge function não tem acesso direto a `auth.users` no destino com `INSERT` (estrutura interna). Pra usuários/senhas, o único caminho confiável é `pg_dump --schema=auth --data-only` (opção 1). Vou deixar isso documentado, e você decide se quer fazer essa parte separada via dump local depois.
- **Sequences** (ex.: `order_number_seq`) não são resetadas — vou rodar `setval` ao final pra cada sequence que existir.
- A connection string fica **só em memória** durante a invocação, não é salva.

## Arquivos a criar
- `supabase/functions/db-export-to-external/index.ts` — a função
- `src/components/admin/DbExportCard.tsx` — UI: input pra connection string + botão + log de progresso
- Adicionar `<DbExportCard />` no `MasterAdmin` (perto do `R2MigrationCard`)

## Segurança
- Só `master_admin` pode chamar (mesmo padrão do `r2-migrate`)
- Connection string nunca logada
- Função roda com `verify_jwt = true` (default)

## Pós-cópia (você roda manualmente no destino)
Vou te entregar 1 query SQL pra validar contagens lado a lado e 1 pra resetar sequences.

---

**Pronto pra implementar?** Se sim, sigo. Se quiser ajustar algo (ex.: incluir/excluir alguma tabela, mudar página de 500), me diga antes.