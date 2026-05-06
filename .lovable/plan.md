## Editar campanha (mesmo ativa)

Adicionar a possibilidade de editar uma campanha em qualquer status, com a regra de que **edição só é permitida quando a campanha está pausada ou em draft** — se estiver `running`, o sistema pausa automaticamente antes de abrir o editor.

### Fluxo do usuário

1. Na lista de campanhas (`BulkCampaignsPanel` — usado tanto no Dashboard quanto no Admin), cada linha ganha um botão **Editar** (ícone de lápis).
2. Ao clicar:
   - Se a campanha está `running` → mostra confirmação "A campanha será pausada para edição. Continuar?" e altera status para `paused`.
   - Abre o mesmo dialog usado para criar campanha, em modo edição, pré-preenchido.
3. Usuário pode alterar:
   - Nome
   - Texto da mensagem (com `{nome}`)
   - URL da mídia
   - Intervalo de envio (segundos)
   - Pausa automática (a cada N msg / duração em min)
   - **Destinatários**: adicionar novos contatos (mesmos filtros de cliente já existentes) ou remover pendentes.
4. Ao salvar, a campanha permanece `paused`. Usuário clica em **Play** para retomar.

### Regras importantes

- **Não é possível remover destinatários já enviados** (`status = sent`/`failed`) — apenas os `pending`.
- Adicionar novos contatos cria novos `bulk_campaign_recipients` com `status = pending` e atualiza `total` da campanha.
- Editar texto/mídia/intervalo/pausa afeta apenas envios futuros — quem já recebeu não é reenviado.
- Ao editar uma campanha pausada por auto-pausa (`paused_until` no futuro), o usuário pode optar por **limpar a pausa** (botão "Retomar agora") que zera `paused_until` e `sent_in_block`.

### Mudanças técnicas

**Frontend** — `src/components/dashboard/BulkCampaignsPanel.tsx`:
- Refatorar o `CreateCampaignDialog` interno para aceitar prop `campaign?: BulkCampaign` (modo edição).
- Em modo edição:
  - Pré-carregar valores e recipients existentes.
  - Mostrar lista de recipients atuais com badge de status; permitir remover só os `pending`.
  - Botão "Adicionar contatos" abre seletor com os mesmos filtros de cliente.
  - Submit faz `UPDATE` em `bulk_campaigns` + `INSERT` dos novos recipients + `DELETE` dos removidos.
- Adicionar botão **Editar** (lápis) na tabela de campanhas, ao lado de Play/Pause/Delete.
- Handler do botão: se status = `running`, faz `update status='paused'` antes de abrir o dialog.
- Adicionar botão **"Retomar agora"** quando `paused_until` está no futuro.

**Backend**: nenhuma mudança de schema necessária — todas as colunas (`interval_seconds`, `pause_after_messages`, `pause_duration_minutes`, `media_url`, `message_text`, `name`) já existem e as RLS policies já permitem update pelo manager/admin. O worker já lê esses valores a cada iteração, então mudanças tomam efeito imediatamente quando a campanha voltar a `running`.

### Arquivos afetados

- `src/components/dashboard/BulkCampaignsPanel.tsx` (única edição)
