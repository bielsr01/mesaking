## Mover a configuração do popup pós-pedido para o painel do restaurante

Hoje os campos do popup ficam dentro do `EvolutionIntegrationCard`, que é o card editável usado **só no painel admin**. No painel do restaurante, o card é o `IntegrationStatusCard` (somente leitura, modal da imagem). Por isso o restaurante não consegue acessar.

### Mudanças

**1. Remover do admin (`EvolutionIntegrationCard`)**
- Apagar a seção "Popup pós-pedido (cardápio)" e os states `popupEnabled`, `popupText`, `popupMsg`.
- Tirar a importação de `Textarea` (não é mais usada lá).
- Remover os campos `popup_*` do `payload` salvo pelo admin.

**2. Adicionar no painel do restaurante (`EvolutionMessagesPanel`)**

Esse painel já aparece em `/dashboard → Integrações` quando a Evolution está configurada e é o lugar natural para o lojista mexer em mensagens do WhatsApp.

Adicionar um novo bloco no topo (acima da lista de eventos), com:

- Switch "Popup pós-pedido no cardápio"
- Textarea "Texto do popup" (mensagem mostrada na tela ao cliente)
- Textarea "Mensagem pré-preenchida no WhatsApp" + dica das variáveis `{{nome}}`, `{{pedido}}`, `{{total}}`
- Aviso de que o número usado é o telefone cadastrado da loja
- Botão "Salvar"

Lê e grava direto em `public.evolution_integrations` (campos `popup_enabled`, `popup_text`, `popup_whatsapp_message`) usando o `restaurant_id`. A RLS já permite (`Manager manages own evolution`).

### Sem alterações
- Banco de dados (colunas e função RPC `get_restaurant_popup_config` continuam).
- Frontend público do checkout (`Checkout.tsx` + `OrderSuccessWhatsAppDialog`) — segue funcionando igual.
- Card admin continua só com URL/API Key/Instance/Switch ativo.
