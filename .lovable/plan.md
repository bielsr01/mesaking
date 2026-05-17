
# Fluxo de Caixa — Plano de Implementação

Página completa para controle diário de caixa, integrada aos pedidos (PDV, iFood, Quero), com abertura/fechamento, sangrias, conciliação e auditoria.

## 1. Banco de dados (migration)

Novas tabelas em `public`:

- **cash_register_sessions** — sessão de caixa
  - `restaurant_id`, `opened_by`, `opened_at`, `opening_amount`
  - `closed_by`, `closed_at`, `closing_cash_bills`, `closing_cash_coins`, `closing_notes`
  - `expected_cash`, `counted_cash`, `difference`, `status` (`open`|`closed`)
  - `opening_notes`

- **cash_movements** — toda entrada/saída em dinheiro
  - `session_id`, `restaurant_id`, `order_id?`, `type` (`order_cash`|`change_out`|`withdrawal`|`supply`|`adjustment`)
  - `amount` (positivo entra, negativo sai), `description`, `created_by`, `created_at`

- **cash_withdrawals** — sangrias (espelho enriquecido)
  - `session_id`, `restaurant_id`, `amount`, `reason`, `created_by`, `created_at`

- **payment_reconciliation** — totais por método/plataforma fechados ao encerrar
  - `session_id`, `method`, `platform`, `gross`, `fees`, `net`, `orders_count`

- **operator_logs** — auditoria genérica
  - `restaurant_id`, `session_id?`, `actor_id`, `action`, `entity`, `entity_id`, `details jsonb`, `created_at`

RLS: `is_restaurant_manager(auth.uid(), restaurant_id) OR has_role(...,'master_admin')` em todas. Inserts via SECURITY DEFINER função `cash_register_open`, `cash_register_close`, `cash_add_movement`, `cash_add_withdrawal` para garantir consistência e log automático.

Permissões adicionadas em `access_groups.permissions`:
- `cash_flow.view`
- `cash_flow.operate` (abrir/fechar/sangria)
- `cash_flow.admin` (ajustes, ver auditoria, conciliação)

## 2. Cálculo desacoplado

`src/lib/cashFlow.ts`:
- `computeSessionTotals(orders, movements, ifoodFees, queroFees)` retorna:
  - totais por método (dinheiro, pix, débito, crédito)
  - totais por plataforma (PDV, iFood, Quero)
  - taxas e líquido
  - dinheiro físico esperado considerando troco (`change_for - total`)
  - divergência vs `counted_cash`
- Pedidos `payment_method='cash'` com `change_for` geram entrada líquida = `total` (troco reduzido como `change_out` automático ao aceitar pedido — registrado em `cash_movements`).

## 3. Página `/caixa`

Rota nova em `App.tsx`, protegida por `RequireRole manager` + checagem de permissão `cash_flow.view`. Adicionada no `AppSidebar`.

### Layout (tabs)

1. **Resumo** — 12 cards (vendido, dinheiro, pix, crédito, débito, iFood, Quero, taxas, líquido, esperado em caixa, diferença, qtde pedidos). Atualiza por Realtime nas tabelas `orders` e `cash_movements`.
2. **Caixa atual** — abertura (se fechado) ou fechamento (se aberto), com inputs de cédulas/moedas, sangrias rápidas, suprimento. Mostra divergência em tempo real.
3. **Movimentações** — tabela com horário, pedido, plataforma, pagamento, valor, taxa entrega, taxa plataforma, cupom, líquido, status, operador. Filtros: período, plataforma, método, operador, status.
4. **Sangrias** — lista + botão "Nova sangria".
5. **Dashboard** — gráficos Recharts: vendas por método (pizza), vendas por hora (barra), evolução do caixa (linha), iFood vs Quero (barra agrupada), bruto vs líquido.
6. **Auditoria** — log `operator_logs` (somente `cash_flow.admin`).

### Modos
- **Caixa simplificado** (default p/ operador): apenas tabs Caixa atual + Sangrias.
- **Financeiro avançado** (admin): todas as tabs.

### Alertas (toast/banner)
- caixa negativo, divergência > 5%, mais de N sangrias, pedidos pendentes ao tentar fechar (bloqueia com confirmação).

### Impressão
- Botão "Imprimir fechamento" reutilizando padrão de `src/lib/ticket.ts`.

## 4. Integração com pedidos

- Pedidos do iFood/Quero já são sincronizados nas tabelas `orders` com `external_source`. O cálculo usa esses dados; nada novo a sincronizar.
- Taxas calculadas via `calcIfoodReceivable` (já existe) e `lib/queroFees.ts`.
- Cupons já em `orders.discount` e `merchant_subsidy`.

## 5. Componentes novos

```
src/pages/CashFlow.tsx
src/components/cashflow/SummaryCards.tsx
src/components/cashflow/OpenSessionDialog.tsx
src/components/cashflow/CloseSessionDialog.tsx
src/components/cashflow/WithdrawalDialog.tsx
src/components/cashflow/MovementsTable.tsx
src/components/cashflow/CashFlowCharts.tsx
src/components/cashflow/AuditLog.tsx
src/lib/cashFlow.ts
src/hooks/useCashSession.ts
```

## Detalhes técnicos

- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE cash_movements, cash_register_sessions;` e canal em `useCashSession`.
- Permissões aplicadas via `usePermissions(restaurantId).can('cash_flow.view'|'operate'|'admin')`.
- Entrada no `AdminSidebar` (master_admin enxerga consolidado multi-loja, reaproveita `RestaurantMultiSelect`).
- Validação Zod nos diálogos.
- Tudo em tokens semânticos do design system.

## Ordem de execução

1. Migration (tabelas + funções + RLS + 3 chaves de permissão).
2. `src/lib/cashFlow.ts` + `useCashSession`.
3. Página `CashFlow.tsx` com tabs e modais.
4. Rota + item de menu + chave de permissão na UI de Access Groups.
5. Realtime + impressão + auditoria.
