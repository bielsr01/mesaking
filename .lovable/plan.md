## Objetivo

Simplificar a conexão WhatsApp de cada restaurante. O admin não configura mais URL/token/instância manualmente — o sistema usa **env globais** (URL da Evolution + API Key Global) e cria automaticamente uma instância por restaurante. O lojista só clica em "Conectar WhatsApp" e escaneia um QR code.

As regras de envio de mensagens, popup pós-pedido e templates **permanecem intactas**.

---

## 1. Secrets (env do projeto)

Adicionar dois secrets:
- `EVOLUTION_API_URL` — base da Evolution (ex.: `https://evo.suaempresa.com`)
- `EVOLUTION_API_KEY` — token **global** (gerencia instâncias)

Vou pedir esses valores via `add_secret` antes de seguir.

## 2. Banco

Migration em `evolution_integrations`:
- Adicionar colunas: `instance_token text`, `qrcode text`, `phone_number text`
- Tornar `api_url`, `api_key`, `instance_name` **nullable** (passam a ser preenchidos automaticamente)
- Manter colunas existentes (`enabled`, `popup_*`, `last_status`, etc.)

Sem mudança nas RLS, triggers, ou na função `enqueue_evolution_message_for_order`.

## 3. Nova edge function: `evolution-instance`

Tudo usa o token global do env. Ações:
- `create` — gera `instanceName` único (`mk_<restaurantId8>_<rand>`), chama `POST /instance/create`, salva `instance_name` + `instance_token` (campo `hash`) no registro do restaurante. Cria a linha em `evolution_integrations` se não existir.
- `connect` — `GET /instance/connect/{instance}`, retorna QR code base64; salva em `qrcode`.
- `state` — `GET /instance/connectionState/{instance}`, atualiza `last_status` e, se `open`, marca `enabled=true` e limpa `qrcode`.
- `logout` — `POST /instance/logout/{instance}`, marca status disconnected.
- `delete` — `DELETE /instance/delete/{instance}`, limpa campos da instância.

Validação: usuário tem que ser manager do `restaurant_id` (ou master_admin).

## 4. Atualizar funções existentes

- `evolution-send` e `evolution-dispatch`: quando `api_url`/`api_key` da linha estiverem vazios, usar env globais; e ao enviar mensagens (`/message/sendText`, `/message/sendMedia`), usar `instance_token` (token da instância) em vez do global. Para `verify`/`connectionState`, continua o global.
- `admin-create-restaurant`: depois de criar o restaurante, invoca internamente o fluxo `create` da Evolution (best-effort — se falhar, restaurante segue criado e o lojista cria manualmente depois).

## 5. UI — Admin

`EvolutionIntegrationCard` (escopo admin):
- Remover inputs de URL/API Key/Instance.
- Mostrar apenas status do env (configurado? / quantas instâncias ativas) e um único Switch para habilitar/desabilitar globalmente o uso da integração.

## 6. UI — Restaurante

`IntegrationStatusCard` da Evolution / `IntegrationsPanel`:
- Se ainda não há instância criada → botão grande **"Criar instância WhatsApp"** (chama `create`).
- Se há instância mas status ≠ `open` → botão grande **"Conectar WhatsApp"** que abre dialog com QR code (chama `connect`, exibe imagem, faz polling em `state` a cada 3s; ao detectar `open`, fecha o dialog e atualiza badge para "Conectado").
- Se status = `open` → mostrar número conectado + botão "Desconectar" (`logout`) e "Mostrar novo QR" (recria sessão).
- Mantém o `extraContent` com `EvolutionMessagesPanel` (popup pós-pedido + templates) inalterado.

## 7. Sem mudanças

- `evolution_message_templates`, `evolution_message_queue` e trigger `enqueue_evolution_message_for_order`.
- `EvolutionMessagesPanel` (popup + templates).
- Checkout / `OrderSuccessWhatsAppDialog`.

---

## Detalhes técnicos

- Endpoints Evolution conforme gist: `/instance/create`, `/instance/connect/{name}`, `/instance/connectionState/{name}`, `/instance/logout/{name}`, `/instance/delete/{name}`. Header `apikey: <token>`.
- `instance_token` vem do campo `hash` da resposta de `create`.
- Polling do QR no front: `setInterval(3000)` chamando `state`; para quando `open` ou após 2 min.
- Backfill: para restaurantes já existentes sem instância, o botão "Criar instância" resolve.

## Próximos passos após aprovação

1. Pedir os dois secrets (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`).
2. Rodar migration.
3. Criar `evolution-instance` e ajustar `evolution-send` / `evolution-dispatch` / `admin-create-restaurant`.
4. Reescrever os dois cards (admin e restaurante).