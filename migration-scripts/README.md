# Migração Lovable Cloud → Supabase externo

Execute todos os comandos abaixo na sua **máquina local** (não no Lovable).

## Pré-requisitos
- PostgreSQL client 15+ instalado (`pg_dump --version` deve retornar >= 15)
  - macOS: `brew install postgresql@15`
  - Ubuntu: `sudo apt install postgresql-client-15`
- Supabase CLI: `npm i -g supabase` (necessário para deploy das edge functions)

## Variáveis (preencha antes)
```bash
# ORIGEM (Lovable Cloud)
export SRC_DB="postgresql://postgres.kcjrrnxsqdcgjqplgiku:SENHA_ORIGEM@aws-0-REGIAO.pooler.supabase.com:5432/postgres"

# DESTINO (seu novo Supabase)
export DST_DB="postgresql://postgres.NOVO_REF:SENHA_DESTINO@aws-0-REGIAO.pooler.supabase.com:5432/postgres"
export DST_REF="NOVO_REF"   # ex.: abcdefghijklm
```

---

## Passo 1 — Dump da origem

```bash
# Schema + dados do schema public
pg_dump "$SRC_DB" \
  --schema=public \
  --no-owner --no-privileges \
  --quote-all-identifiers \
  --clean --if-exists \
  -f dump_public.sql

# Schema auth (usuários + senhas + identities)
pg_dump "$SRC_DB" \
  --schema=auth \
  --no-owner --no-privileges \
  --quote-all-identifiers \
  --data-only \
  --disable-triggers \
  -f dump_auth_data.sql
```

> Não dumpamos a estrutura do `auth` — ela já vem pronta no destino. Só copiamos os dados (users, identities, etc.).

## Passo 2 — Restore no destino

```bash
# Restaura schema public completo
psql "$DST_DB" -f dump_public.sql

# Restaura dados do auth (usuários + senhas)
psql "$DST_DB" -f dump_auth_data.sql
```

Se aparecerem erros tipo `duplicate key` no auth, rode antes:
```bash
psql "$DST_DB" -c "TRUNCATE auth.users CASCADE;"
psql "$DST_DB" -f dump_auth_data.sql
```

## Passo 3 — Validação

```bash
# Contagens lado a lado das tabelas críticas
for tbl in restaurants orders order_items customers profiles user_roles products categories option_groups option_items expenses; do
  src=$(psql "$SRC_DB" -t -A -c "SELECT count(*) FROM public.$tbl")
  dst=$(psql "$DST_DB" -t -A -c "SELECT count(*) FROM public.$tbl")
  printf "%-25s origem=%-8s destino=%-8s %s\n" "$tbl" "$src" "$dst" "$([ "$src" = "$dst" ] && echo OK || echo DIFF)"
done

# Contagem de usuários auth
src=$(psql "$SRC_DB" -t -A -c "SELECT count(*) FROM auth.users")
dst=$(psql "$DST_DB" -t -A -c "SELECT count(*) FROM auth.users")
echo "auth.users               origem=$src destino=$dst"
```

## Passo 4 — Patch da função `enqueue_evolution_message_for_order`

A função tem o ref antigo e a anon key antiga hardcoded. Rode no **destino**:

```bash
# Substitua NOVO_REF e NOVA_ANON_KEY pelos valores reais
psql "$DST_DB" <<'SQL'
CREATE OR REPLACE FUNCTION public.enqueue_evolution_message_for_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
  _event text; _tpl record; _msg text; _digits text; _delay int;
BEGIN
  _digits := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  IF length(_digits) < 10 THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    _event := 'order_received';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    _event := CASE NEW.status::text
      WHEN 'accepted' THEN 'order_accepted'
      WHEN 'preparing' THEN 'order_in_production'
      WHEN 'out_for_delivery' THEN 'order_out_for_delivery'
      WHEN 'awaiting_pickup' THEN 'order_awaiting_pickup'
      WHEN 'delivered' THEN CASE
        WHEN NEW.external_source = 'quero' THEN 'order_delivered_quero'
        WHEN NEW.order_type::text = 'pickup' THEN 'order_delivered_pickup'
        WHEN NEW.order_type::text = 'pdv' THEN 'order_delivered_pdv'
        WHEN NEW.order_type::text = 'delivery' THEN 'order_delivered_delivery'
        ELSE NULL END
      ELSE NULL END;
  ELSE RETURN NEW; END IF;

  IF _event IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _tpl FROM public.evolution_message_templates
    WHERE restaurant_id = NEW.restaurant_id AND event_key = _event AND enabled = true LIMIT 1;
  IF _tpl IS NULL OR COALESCE(_tpl.template, '') = '' THEN RETURN NEW; END IF;

  _msg := _tpl.template;
  _msg := replace(_msg, '{{nome}}', COALESCE(NEW.customer_name, ''));
  _msg := replace(_msg, '{{pedido}}', COALESCE(NEW.order_number::text, ''));
  _msg := replace(_msg, '{{total}}', to_char(COALESCE(NEW.total, 0), 'FM999G990D00'));

  _delay := COALESCE(_tpl.delay_minutes, 0);

  INSERT INTO public.evolution_message_queue
    (restaurant_id, order_id, event_key, phone, message, scheduled_at)
  VALUES (NEW.restaurant_id, NEW.id, _event, NEW.customer_phone, _msg,
          now() + make_interval(mins => _delay));

  IF _delay = 0 THEN
    PERFORM net.http_post(
      url := 'https://NOVO_REF.supabase.co/functions/v1/evolution-dispatch',
      headers := '{"Content-Type":"application/json","apikey":"NOVA_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END; $func$;
SQL
```

## Passo 5 — Deploy das Edge Functions

```bash
cd /caminho/do/projeto   # diretório que contém supabase/functions/
supabase login
supabase link --project-ref "$DST_REF"
supabase functions deploy --no-verify-jwt geocode maps-key bulk-campaign-worker ihub-webhook quero-poll
supabase functions deploy \
  admin-create-restaurant admin-create-sub-user admin-delete-restaurant admin-update-restaurant admin-update-sub-user \
  evolution-dispatch evolution-instance evolution-send \
  ifood-action ihub-link quero-action \
  r2-migrate r2-upload r2-purge-supabase
```

## Passo 6 — Recriar secrets no destino

No dashboard do **novo Supabase** → Edge Functions → Secrets, recrie:

| Nome | Onde obter |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare R2 |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 |
| `R2_BUCKET` | Cloudflare R2 |
| `R2_PUBLIC_BASE_URL` | Cloudflare R2 (URL pública) |
| `EVOLUTION_API_URL` | Sua instância Evolution |
| `EVOLUTION_API_KEY` | Sua instância Evolution |
| `GOOGLE_MAPS_SERVER_KEY` | Google Cloud Console |
| `LOVABLE_API_KEY` | Não migrar — não terá mais acesso ao AI Gateway do Lovable |

> **`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`** são injetadas **automaticamente** pelo Supabase — não recriar.

## Passo 7 — Configurar Auth no destino

No dashboard do novo Supabase → Authentication:
- **URL Configuration**: Site URL = `https://app.coxinhasurprise.com.br` + Redirect URLs (adicione preview, mesaking.lovable.app, localhost)
- **Providers → Google**: cole Client ID e Secret do Google Cloud (mesmo OAuth client). Adicione o novo callback URL `https://NOVO_REF.supabase.co/auth/v1/callback` nas authorized redirect URIs do Google Cloud
- **Email templates**: copie do projeto antigo se customizou

## Passo 8 — Me avise

Depois de validar o passo 3 (contagens iguais), me passe pelo chat:
- `VITE_SUPABASE_URL` = `https://NOVO_REF.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = anon key do destino
- `VITE_SUPABASE_PROJECT_ID` = `NOVO_REF`

Eu então sobrescrevo `.env`, `src/integrations/supabase/client.ts` (deixo de ser auto-gerado) e regenero `types.ts`.
