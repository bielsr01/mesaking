## Objetivo

Nos tickets impressos (cliente e cozinha), para pedidos com `external_source === "ifood"`:

1. Substituir o telefone do cliente pelo **0800 formatado do iFood**, usando exatamente a mesma função já usada no `OrderDetailsDialog` (`formatIfoodPhone` em `src/lib/format.ts`) — produz `0800 200 1900 (cód: ABC123)`.
2. Adicionar uma linha extra logo abaixo com **`Pedido iFood: <external_order_id>`**.

Para pedidos não-iFood nada muda (continua `formatPhone`).

## Arquivos a editar

1. **`src/lib/ticket.ts`** (`buildTicketHtml`)
   - Importar `formatIfoodPhone`.
   - Estender `TicketOrder` com `external_source?: string | null` e `external_order_id?: string | null`.
   - Onde renderiza `ps.customer_phone`: usar `formatIfoodPhone` quando `order.external_source === "ifood"`, senão `formatPhone`.
   - Logo abaixo do bloco do telefone, quando for iFood e houver `external_order_id`, adicionar `<div>Pedido iFood: <id></div>`.

2. **`src/pages/CustomerTicketPublic.tsx`**
   - Importar `formatIfoodPhone`.
   - O `select("*")` já traz `external_source` e `external_order_id`.
   - Trocar `formatPhone(order.customer_phone)` por condicional + linha extra com o ID quando iFood.

3. **`src/pages/KitchenTicketPublic.tsx`**
   - Mesma alteração da CustomerTicketPublic.

4. **`src/pages/OrderTicket.tsx`**
   - Mesma alteração (garantir que os campos `external_source` e `external_order_id` são carregados; ajustar `select` se necessário).

## Comportamento final no ticket (iFood)

```
JOÃO DA SILVA
0800 200 1900 (cód: ABC123)
Pedido iFood: 12345abc-...
Rua X, 100 ...
```

Não-iFood: inalterado.

## Fora de escopo

- Mudanças de estilo/densidade.
- Outros campos do pedido.