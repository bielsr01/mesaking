## Objetivo

Após o cliente finalizar um pedido no menu público, exibir um popup convidando-o a clicar num botão que abre o WhatsApp da loja com uma mensagem pré-preenchida (personalizável). A função fica configurável (ativar/desativar + texto) no card de integração do WhatsApp.

## 1. Banco de dados

Adicionar 3 colunas em `evolution_integrations` (registro por restaurante):

- `popup_enabled` boolean default false
- `popup_text` text — texto exibido dentro do popup (ex.: "Confirme seu pedido pelo WhatsApp para garantir prioridade!")
- `popup_whatsapp_message` text — mensagem que será enviada ao clicar no botão. Suporta variáveis `{{nome}}`, `{{pedido}}`, `{{total}}`.

O número do WhatsApp já existe em `restaurants.phone` / `restaurants.whatsapp_url`, então não precisa novo campo.

## 2. Configuração (admin/lojista)

No `EvolutionIntegrationCard` (escopo `restaurant`), adicionar uma nova seção dentro do dialog:

- Switch "Popup pós-pedido no cardápio"
- Textarea "Texto do popup" (mensagem mostrada ao cliente na tela)
- Textarea "Mensagem do WhatsApp" (texto pré-preenchido no link `wa.me`)
- Aviso com as variáveis disponíveis: `{{nome}}`, `{{pedido}}`, `{{total}}`

Salvar junto com o restante do payload existente. Não interfere no escopo admin (campos só aparecem quando `scope === "restaurant"`).

## 3. Frontend público (cardápio)

No `Checkout.tsx`, após o pedido ser criado com sucesso (logo antes/depois do `toast.custom` "Pedido enviado", linha ~698):

1. Buscar `evolution_integrations` do restaurante (campos popup_*) — pode ser carregado junto com os dados já usados pelo cardápio para evitar request extra.
2. Se `popup_enabled = true` e o restaurante tem `phone`/`whatsapp_url`, abrir um novo `Dialog` (`OrderSuccessWhatsAppDialog`) contendo:
   - Texto do popup configurado
   - Botão verde "Abrir WhatsApp" que faz `window.open` para `https://wa.me/<digits>?text=<encoded>`
   - Botão secundário "Fechar"
3. A mensagem é montada substituindo `{{nome}}`, `{{pedido}}` (`order.order_number`) e `{{total}}` (formatado em BRL) no `popup_whatsapp_message`.
4. O número usado é `restaurants.phone` (apenas dígitos, prefixo 55 se faltar) — fallback para extrair de `whatsapp_url` se `phone` vazio.

## 4. Detalhes técnicos

- Novo componente `src/components/OrderSuccessWhatsAppDialog.tsx` para manter o `Checkout.tsx` enxuto.
- Estado `successPopup` no `Checkout` controla abertura; é setado antes do `onOpenChange(false)` do checkout.
- Não envia mensagem automaticamente — apenas abre o app do WhatsApp do cliente com texto pronto (não consome Evolution API, não cria fila).
- Funciona mesmo se a Evolution API não estiver conectada — depende só da configuração do popup e do telefone do restaurante.

## 5. Fora do escopo

- Sem alteração no `evolution-dispatch` / fila de mensagens.
- Sem alteração no painel "Mensagens automáticas" (esse continua para envios servidor→cliente via Evolution).
