## Contexto do que encontrei

Olhei os logs do banco (`ihub_events`, `orders`) e o código que dispara as ações:

- **Frontend** (`OrdersPanel.tsx`, função `advance`): o botão "Aceitar"/"Despachar" já manda **apenas** o `orderId` do pedido clicado: `supabase.functions.invoke("ifood-action", { body: { orderId: o.id, action } })`. A última requisição que apareceu na rede confirma isso (apenas 1 chamada com o id da Darlen).
- **Edge function `ifood-action`**: resolve o `external_order_id` daquele 1 pedido e envia para o iHub um payload com `merchantId` + `orderId` específicos. Não há laço, não há "para todos".
- **Webhook `ihub-webhook`**: ao receber `CONFIRMED`/`DISPATCHED`, atualiza `orders` filtrando por `restaurant_id + external_source='ifood' + external_order_id = ev.orderId`. Cada pedido tem `external_order_id` único no banco.
- **O que os eventos mostram**: o pedido da Darlen recebeu CONFIRMED às 19:33 (≈2min após o PLACED) e o do Odon recebeu CONFIRMED às 19:37 (≈4min após o PLACED) — em **horários diferentes** e cada evento veio com o `orderId` correto. Ou seja, no banco os pedidos foram confirmados separadamente, em momentos distintos, vindo do **webhook do iFood** (não do clique manual).

Isso indica que o "todos foram aceitos junto" provavelmente **não foi um clique nosso aceitando vários** — foi o iFood/iHub mandando CONFIRMED automaticamente para cada pedido (auto-aceite no portal do iFood, ou o lojista aceitou no app do iFood, ou regra de auto-confirm ativa no iHub). Precisamos confirmar isso com você antes de mexer no código.

## O que proponho fazer

### 1. Reforçar/auditar o caminho da ação por pedido (defensivo)

Mesmo já estando correto, adicionar travas para garantir que **nunca** uma ação sem `orderId` específico seja aceita:

- `supabase/functions/ifood-action/index.ts`: rejeitar com erro explícito se `externalOrderId` estiver vazio depois da resolução, e logar no console o par `(local orderId, external orderId, merchantId, action)` em toda chamada — para que dê para auditar no painel de logs.
- `OrdersPanel.tsx`: bloquear o botão enquanto a ação está em andamento (estado `pendingAction[id]`) para evitar duplo clique e qualquer chance de race com outro pedido.

### 2. Distinguir "aceito por mim" vs "aceito pelo iFood"

Adicionar coluna `confirmed_by` (`'system' | 'ifood_webhook' | 'manual'`) ou registrar em `ihub_events`/`orders.metadata` a origem da transição. Na UI, mostrar um pequeno selo no card do pedido: "Confirmado pelo iFood" vs "Confirmado por você". Assim, na próxima vez você consegue identificar se foi o webhook ou o seu clique.

### 3. Painel de auditoria por pedido

No detalhe do pedido (já existe `IhubEventsViewer` global), adicionar um mini-timeline mostrando **só os eventos daquele pedido** (`external_order_id`), com hora, código e se veio do webhook ou da nossa ação. Resolve futuras dúvidas como esta na hora.

### 4. Confirmar a hipótese antes de ir além

Antes de eu implementar, preciso saber:

- No portal do **iHub** existe alguma opção tipo "auto-confirmar pedidos" ligada? Se sim, isso explica 100% o que aconteceu (o iHub aceita sozinho assim que o PLACED chega).
- Você tem o **app do iFood Gestor de Pedidos** aberto em outro dispositivo? Ele também pode aceitar automaticamente.
- Você quer que o sistema **trave** a confirmação automática (mantenha em "pendente" até clique manual) ou só quer **enxergar a origem** da confirmação?

## Detalhes técnicos (referência)

```text
Fluxo atual ao clicar Aceitar:
  UI → ifood-action(orderId=local)
         ↓ resolve external_order_id (1 linha)
         → POST ihub /api/ifood/action { merchantId, orderId=external, action: "confirm" }
  Webhook iHub → ihub-webhook
         ↓ filtra orders por external_order_id (1 linha)
         → UPDATE status
```

Nenhum ponto desse fluxo afeta múltiplos pedidos. A causa provável do sintoma é o iFood/iHub disparando CONFIRMED por conta própria.

## Arquivos que serão tocados na implementação

- `supabase/functions/ifood-action/index.ts` — validação extra + log estruturado
- `src/components/dashboard/OrdersPanel.tsx` — lock por pedido + selo de origem
- `supabase/migrations/<nova>.sql` — coluna `confirmed_source` em `orders` (opcional, conforme sua resposta)
- `src/components/dashboard/IhubEventsViewer*` — filtro por `external_order_id`
