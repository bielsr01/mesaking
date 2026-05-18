# Arquitetura de Redirecionamento — Prompt para outro projeto

Cole o conteúdo abaixo no chat do outro projeto. Ele descreve exatamente como replicar o comportamento de redirecionamento por papel (role) usado aqui.

---

## Prompt pronto para enviar

> Quero que o sistema de autenticação e redirecionamento do meu projeto funcione exatamente como descrito abaixo. Implemente os arquivos e a lógica nesse padrão, adaptando apenas os nomes de páginas/roles se necessário.

### 1. Stack e premissas

- React 18 + React Router v6 (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `useNavigate`).
- Backend: Supabase Auth (`@supabase/supabase-js`).
- Existe uma tabela `user_roles (user_id, role)` com roles possíveis: `master_admin`, `manager`, `customer`.
- Papéis NUNCA ficam na tabela `profiles`/`users` — sempre em `user_roles` (evita escalada de privilégio).

### 2. AuthContext (fonte única da verdade)

Crie `src/contexts/AuthContext.tsx` exportando `AuthProvider` e `useAuth()`. O contexto expõe:

```ts
{
  user: User | null,
  session: Session | null,
  roles: AppRole[],
  loading: boolean,        // true até resolver getSession() inicial
  rolesLoading: boolean,   // true enquanto busca user_roles
  isMasterAdmin: boolean,
  isManager: boolean,
  signOut: () => Promise<void>,
  refreshRoles: () => Promise<void>,
}
```

Regras de implementação críticas:

1. **Registrar `onAuthStateChange` ANTES de chamar `getSession()`** — ordem importa para não perder eventos.
2. Dentro do listener, só recarregar roles quando o `user.id` realmente mudar (evita re-render/unmount em `TOKEN_REFRESHED` ao trocar de aba).
3. `loadRoles(userId)` faz: `supabase.from('user_roles').select('role').eq('user_id', userId)` e popula `roles`.
4. `loading` só vira `false` depois que `getSession()` retornar (e, se houver user, depois do primeiro `loadRoles`).
5. `signOut()` chama `supabase.auth.signOut()` e limpa `roles` localmente.

### 3. Componente RequireRole (guard de rotas privadas)

Crie `src/components/RequireRole.tsx`:

```tsx
export function RequireRole({ role, children }: { role: "master_admin" | "manager"; children: ReactNode }) {
  const { user, loading, rolesLoading, isMasterAdmin, isManager } = useAuth();
  if (loading || rolesLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (role === "master_admin" && !isMasterAdmin) return <Navigate to="/" replace />;
  if (role === "manager" && !isManager) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

Comportamento:
- Enquanto carrega sessão/roles → tela "Carregando..." (NUNCA redireciona durante loading, senão pisca pro /auth).
- Sem user → manda para `/auth`.
- User sem o role exigido → manda para `/` (que vai re-rotear corretamente — ver passo 5).

### 4. App.tsx — montagem das rotas

```tsx
<BrowserRouter>
  <AuthProvider>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/admin" element={<RequireRole role="master_admin"><MasterAdmin /></RequireRole>} />
      <Route path="/dashboard" element={<RequireRole role="manager"><ManagerDashboard /></RequireRole>} />
      {/* rotas públicas... */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  </AuthProvider>
</BrowserRouter>
```

`AuthProvider` precisa ficar DENTRO de `BrowserRouter` se usar hooks de router; aqui não usa, então pode ficar dentro mesmo (mantém compatível).

### 5. Página `/` (Index.tsx) — roteador inteligente

`src/pages/Index.tsx` decide para onde mandar o usuário baseado em role:

```tsx
export default function Index() {
  const { user, loading, rolesLoading, isMasterAdmin, isManager } = useAuth();
  if (loading || rolesLoading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando...</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (isMasterAdmin) return <Navigate to="/admin" replace />;
  if (isManager) return <Navigate to="/dashboard" replace />;
  return <Navigate to="/auth" replace />; // logado mas sem role válido
}
```

Resultado:
- Visitante deslogado em `/` → vai pra `/auth`.
- Admin logado em `/` → vai pra `/admin`.
- Manager logado em `/` → vai pra `/dashboard`.

### 6. Página `/auth` (Auth.tsx) — redireciona se já logado

Dentro de `Auth.tsx`, com `useEffect`:

```tsx
useEffect(() => {
  if (!loading && !rolesLoading && user) {
    if (isMasterAdmin) navigate("/admin", { replace: true });
    else if (isManager) navigate("/dashboard", { replace: true });
    else navigate("/", { replace: true });
  }
}, [user, isMasterAdmin, isManager, loading, rolesLoading, navigate]);
```

Resultado: usuário já autenticado NUNCA vê a tela de login — é enviado direto pro painel do seu role.

### 7. Matriz de comportamento esperado

| Rota acessada | Deslogado | Logado sem role | Logado manager | Logado master_admin |
|---|---|---|---|---|
| `/` | → `/auth` | → `/auth` | → `/dashboard` | → `/admin` |
| `/auth` | mostra login | → `/` | → `/dashboard` | → `/admin` |
| `/dashboard` | → `/auth` | → `/` (e daí `/auth`) | mostra painel | → `/` (e daí `/admin`) |
| `/admin` | → `/auth` | → `/` | → `/` (e daí `/dashboard`) | mostra admin |

### 8. Armadilhas a evitar

- NUNCA renderizar `<Navigate>` antes de `loading && rolesLoading` terem terminado — causa flash para `/auth` em usuários logados.
- NUNCA checar role pelo `localStorage` ou pelo `user_metadata` — sempre via tabela `user_roles` no servidor.
- NUNCA chamar `loadRoles` em todo evento de `onAuthStateChange`; só quando o `user.id` mudar.
- Usar sempre `replace: true` nos redirects de auth pra não poluir o histórico do browser.
- Em `signUp`/reset de senha, passar `emailRedirectTo: ${window.location.origin}/`.

---

Replique exatamente esses 8 pontos no outro projeto que o comportamento de redirecionamento vai ficar idêntico ao meu.
