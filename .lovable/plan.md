# Migração do Lovable Cloud para Supabase externo

## Aviso importante (irreversível)

Trocar o `.env` para apontar para outro projeto efetivamente **desconecta seu app do Lovable Cloud**. Os arquivos auto-gerados (`src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`) deixarão de ser sincronizados pelo Lovable. Não é possível "reconectar" depois — somente recriar Cloud em um projeto novo. Você confirmou que tem ciência.

## O que será migrado

1. **Schema completo** do banco: tabelas, enums, índices, funções, triggers, RLS policies, sequences
2. **Todos os dados** das tabelas `public.*`
3. **Usuários do Auth** (`auth.users` com senhas, identidades, sessões)
4. **~20 Edge Functions** com seus secrets
5. **NÃO** será migrado storage (imagens já estão no R2)

## Etapas

### 1. Coleta de credenciais (você executa local)
Você vai precisar ter à mão, do **projeto destino**:
- `DB connection string` (Settings → Database → Connection string → URI, com a senha)
- `Project ref` (ex.: `abcdefghijklm`)
- `anon key` e `service_role key`
- `JWT secret` (opcional, mas recomendado para manter tokens válidos)

E do **projeto origem (Lovable Cloud)** preciso te dar:
- Connection string read-only (vou gerar via dashboard de Cloud)

### 2. Dump + restore do banco (executado por você, local)
Comandos que vou te entregar prontos:

```bash
# Dump origem (schema + dados + auth)
pg_dump \
  --clean --if-exists \
  --quote-all-identifiers \
  --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  -d "postgresql://postgres.kcjrrnxsqdcgjqplgiku:SENHA@aws-...:5432/postgres" \
  -f dump.sql

# Restore destino
psql -d "postgresql://postgres.NOVO_REF:SENHA@...:5432/postgres" -f dump.sql
```

Vou também te dar o script alternativo via **Supabase CLI** (`supabase db dump` + `supabase db push`) caso prefira.

### 3. Validação pós-restore
Script SQL que vou fornecer para comparar contagens das principais tabelas (orders, restaurants, customers, profiles, user_roles, etc.) entre origem e destino.

### 4. Edge Functions
- Copio todas as ~20 functions para o projeto destino via Supabase CLI (`supabase functions deploy`)
- Você precisa **recriar manualmente** as ~15 secrets no novo dashboard (R2_*, EVOLUTION_*, GOOGLE_MAPS_SERVER_KEY, LOVABLE_API_KEY, etc.) — secrets nunca são exportáveis
- Replico o `verify_jwt = false` para as functions que precisam (geocode, maps-key, bulk-campaign-worker, ihub-webhook, quero-poll)

### 5. Configurações Auth
Você reconfigura manualmente no novo dashboard (não exportável):
- Google OAuth (Client ID/Secret)
- Email templates
- Site URL e Redirect URLs (`https://mesaking.lovable.app`, `https://app.coxinhasurprise.com.br`, preview)
- Rate limits, JWT expiry

### 6. Troca do client no código
Depois de você confirmar que o restore funcionou, eu:
- Sobrescrevo `.env` com URL/key do novo projeto
- Sobrescrevo `src/integrations/supabase/client.ts` (que hoje é auto-gerado) com um client manual apontando pro novo projeto
- Gero novo `types.ts` a partir do schema do destino
- Atualizo hardcoded references ao project ref antigo (`kcjrrnxsqdcgjqplgiku`) que encontrei em pelo menos uma função (`enqueue_evolution_message_for_order` tem URL hardcoded da function `evolution-dispatch` + apikey antiga — preciso atualizar essa função no destino)

### 7. Pós-corte
- Recomendo manter Cloud antigo pausado por ~7 dias como backup
- Testar fluxos críticos: login, criar pedido (público), webhook iFood/iHub, envio Evolution WhatsApp, upload imagem (R2), PDV

## Detalhes técnicos

### Hardcoded references a corrigir
- `supabase/migrations/*` (ou função `enqueue_evolution_message_for_order`): contém `https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/evolution-dispatch` + anon key antigo embutidos via `pg_net`. Precisa nova migration no destino substituindo URL e key.
- `supabase/config.toml`: `project_id = "kcjrrnxsqdcgjqplgiku"` → trocar para novo ref

### Edge functions que dependem de secrets internas do Supabase
Todas as functions usam `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — essas são **injetadas automaticamente** pelo Supabase no destino, não precisam recriar.

### Auth migration caveat
`pg_dump` do schema `auth` preserva senhas (bcrypt), mas alguns campos como `instance_id` podem precisar ajuste. Vou incluir um patch SQL pós-restore se necessário.

### Rollback
Se algo der errado no destino antes do passo 6, basta não trocar o `.env` — o app continua no Cloud original intacto.

## O que preciso de você para começar
Após aprovar o plano, me envie por chat:
1. Connection string completa do **destino** (com senha do DB)
2. Project ref do destino
3. Anon key e service_role key do destino

Vou então gerar: script de dump/restore, migration de patches, novo `client.ts`, novo `.env`, lista de secrets para recriar, e checklist de validação.
