## Objetivo
Simplificar a confirmação de entrega de pedidos iFood:
- **Delivery**: botão abre o link de confirmação do iFood (`confirmacao-entrega-propria.ifood.com.br/pedido/{id}/codigo-cliente`) em nova aba.
- **Retirada**: remove o botão de entregar; deixa o iFood confirmar automaticamente via webhook (igual antes).

## O que muda

### 1. OrdersPanel.tsx — botão do card de pedido
No bloco que renderiza o botão de ação para pedidos iFood em `out_for_delivery` ou `awaiting_pickup`:

- **Se `order_type === "delivery"` e `status === "out_for_delivery"`**  
  Substituir o botão atual por um link que abre em nova aba:
  ```text
  https://confirmacao-entrega-propria.ifood.com.br/pedido/{order.id}/codigo-cliente
  ```
  Label: "📦 Confirmar entrega no iFood" (ou similar, ajustar conforme necessidade).

- **Se `order_type === "pickup"` e `status === "awaiting_pickup"`**  
  Não renderizar nenhum botão de entrega. O pedido continua visível em "Aguardando retirada" até o webhook do iFood atualizar para entregue.

### 2. OrdersPanel.tsx — limpar código do dialog de código (opcional mas recomendado)
Como não haverá mais fluxo de digitar código no painel:
- Remover estado `ifoodCodeTarget`, `ifoodCodeValue`, `setIfoodCodeTarget`, `setIfoodCodeValue`.
- Remover função `confirmIfoodDelivery`.
- Remover o `<Dialog>` de confirmação de código (linhas 910–947).

### 3. OrderDetailsDialog.tsx
Já está correto: o botão de avançar não aparece para iFood quando `next === "delivered"` (linha 470). Nenhuma alteração necessária.

### 4. ifood-action edge function
Nenhuma alteração necessária. As ações `verifyDeliveryCode`/`validatePickupCode` podem continuar existindo no edge function (não interferem), mas não serão mais chamadas pelo painel.

## Resumo do comportamento
| Tipo | Status atual | Ação do botão |
|------|-------------|---------------|
| iFood Delivery | Em entrega (`out_for_delivery`) | Abre link iFood em nova aba |
| iFood Retirada | Aguardando retirada (`awaiting_pickup`) | Sem botão; iFood confirma sozinho |
| iFood (outros) | Próximos status (`pending`, `preparing`, etc.) | Mantém comportamento atual via iHub |
