## Diagnóstico

Sua última campanha está configurada com **`interval_seconds = 3`** (3 segundos entre mensagens). Isso vem da tabela `bulk_campaigns` — cada campanha tem o seu próprio delay configurável na UI.

O envio está demorando **muito mais que 3s** por causa de **dois problemas** no `supabase/functions/bulk-campaign-worker/index.ts`:

### Bug #1 (crítico) — `startedAt` no escopo do módulo

```ts
const MAX_RUN_MS = 50_000;
const startedAt = Date.now();   // ← avaliado UMA VEZ quando o módulo carrega
...
Deno.serve(async (req) => {
  while (Date.now() - startedAt < MAX_RUN_MS) { ... }
});
```

Em Edge Functions o módulo é reaproveitado entre invocações (instância "quente"). Depois da primeira chamada, `Date.now() - startedAt` já passou de 50s → o `while` **nem entra** nas próximas execuções. Resultado: o worker só processa de fato quando a instância sobe do zero (cold start). Nas chamadas mornas ele retorna imediatamente sem enviar nada, e você só vê movimento quando o cron aciona uma instância nova.

### Bug #2 — Throttle sem espera

Quando a campanha está dentro do `interval_seconds`, o código faz `continue` e refaz o `select` em loop apertado, queimando CPU sem aguardar. Tecnicamente funciona, mas combinado com o bug #1 ajuda a estourar o `MAX_RUN_MS`.

### Cron

O cron dispara o worker a cada 30s. Com o bug #1, na prática o intervalo efetivo entre mensagens vira o intervalo entre cold starts (pode passar de minutos), em vez dos 3s configurados.

## Correção proposta

Arquivo: `supabase/functions/bulk-campaign-worker/index.ts`

1. **Mover `startedAt` para dentro do handler** (`Deno.serve`), para que cada invocação tenha sua própria janela de 50s.
2. **Aguardar o tempo restante do intervalo** quando a campanha está throttled, em vez de `continue` em loop:
   ```ts
   const waitMs = interval - (Date.now() - new Date(c.last_run_at).getTime());
   if (waitMs > 0) { await sleep(Math.min(waitMs, 2000)); continue; }
   ```
3. (Opcional) Ajustar o `sleep(1000)` final para algo menor quando há campanhas ativas, para não desperdiçar a janela.

## Resultado esperado

Com `interval_seconds = 3` e a correção:
- Primeira mensagem: imediata ao iniciar a campanha
- Próximas: a cada ~3s (dentro da janela de 50s do worker)
- Cron de 30s garante continuidade entre invocações

Posso aplicar essa correção?
