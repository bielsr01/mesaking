## Problema

Ao logar, o redirecionamento usa `isMasterAdmin` / `isManager`, mas esses valores dependem da tabela `user_roles`, que é carregada **assincronamente** depois que `user` é definido. Resultado:

1. `signIn` dispara `onAuthStateChange` → `user` é setado imediatamente, `roles` ainda é `[]`.
2. O `useEffect` em `Auth.tsx` roda com `user` presente mas `isMasterAdmin=false` e `isManager=false` → cai no `else` e navega para `/`.
3. `Index.tsx` vê `user` sem roles → redireciona de volta para `/auth`.
4. Quando os roles finalmente chegam, o redirecionamento correto acontece — mas nesse meio tempo o usuário pode ver tela errada, ou em alguns casos ficar parado em `/`.

O `RequireRole` tem o mesmo risco: durante a janela em que `loading=false` mas roles ainda não chegaram (ex.: trocar de conta sem reload), ele redireciona indevidamente para `/`.

## Solução

Introduzir uma flag explícita `rolesLoading` no `AuthContext` e usá-la em todos os pontos de redirecionamento.

### 1. `src/contexts/AuthContext.tsx`

- Adicionar estado `rolesLoading: boolean` (inicial `false`).
- Em `loadRoles`: setar `rolesLoading=true` antes do fetch e `false` no `finally`.
- No `onAuthStateChange`: quando há novo user, setar `rolesLoading=true` imediatamente (antes do `setTimeout`) para evitar a janela onde `user` existe mas roles ainda são as antigas/vazias. Quando `newSession` é null, limpar roles e garantir `rolesLoading=false`.
- Expor `rolesLoading` no value do contexto.

### 2. `src/pages/Auth.tsx`

- Importar `rolesLoading` do `useAuth`.
- No `useEffect` de redirect, só executar quando `!loading && !rolesLoading && user`.
- Manter prioridade: `master_admin` → `/admin`, `manager` → `/dashboard`, senão `/` (cliente comum, mas isso não deve acontecer com contas de painel).

### 3. `src/pages/Index.tsx`

- Importar `rolesLoading`. Enquanto `loading || rolesLoading`, mostrar tela "Carregando..." (mesma UX já existente).
- Só decidir destino depois que roles carregarem.

### 4. `src/components/RequireRole.tsx`

- Tratar `rolesLoading` igual a `loading`: enquanto qualquer um for true, mostrar "Carregando...". Só então avaliar `isMasterAdmin` / `isManager` e redirecionar.

## Resultado

- Login com conta admin → fica em `/auth` mostrando "Entrando..."/spinner até roles carregarem → vai direto para `/admin`.
- Login com conta manager → vai direto para `/dashboard`.
- Acesso cruzado (admin tentando `/dashboard` ou manager tentando `/admin`) continua bloqueado pelo `RequireRole`, agora sem o falso-negativo da janela de carregamento.
- Nenhuma mudança de banco, RLS ou edge function.
