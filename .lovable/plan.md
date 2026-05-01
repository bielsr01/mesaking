
# SaaS Restaurantes — MVP Enxuto (Fase 1)

Vamos começar com um MVP focado: cadastro multi-tenant, cardápio, checkout do cliente final com ViaCEP, gestão de pedidos em tempo real e painéis básicos para Master Admin e Manager. PDV, promoções/cupons, dashboard com gráficos e raio de entrega ficam para fases seguintes.

## Identidade visual

- Tema claro, paleta quente "food" mas sóbria.
- Primária: laranja-âmbar (energia/apetite). Acentos: verde para "aberto/entregue", vermelho para "fechado/cancelado".
- Tipografia: Inter (UI) + Manrope (títulos). Cantos arredondados médios, sombras suaves, cards limpos.
- Tudo via design system (tokens HSL no `index.css` + `tailwind.config.ts`), nada hardcoded.

## Backend (Lovable Cloud)

Tabelas principais com RLS:

- `profiles` — vinculado a `auth.users` (nome, telefone).
- `user_roles` — papéis `master_admin`, `manager`, `customer` (tabela separada + função `has_role` SECURITY DEFINER).
- `restaurants` — nome, slug, logo, horário, status (aberto/fechado), `owner_id`.
- `restaurant_members` — vincula manager(s) a um restaurante.
- `categories` — por restaurante, ordem, ativo.
- `products` — categoria, nome, descrição, preço, foto, ativo.
- `orders` — restaurante, cliente (nome/telefone/endereço completo), tipo (`delivery` por enquanto), status, total, método de pagamento (string), `created_at`, token público de rastreio.
- `order_items` — pedido, produto (snapshot de nome/preço), qtd, observação.

Status do pedido: `pending → accepted → preparing → out_for_delivery → delivered` + `cancelled`.

Realtime do Supabase ativado em `orders` e `order_items` — sem polling.

Storage: bucket `menu-images` para fotos de produto e logos.

## 1. Autenticação e níveis de acesso

- **Apenas email/senha** (sem Google nem outros provedores sociais).
- Cliente final faz checkout **sem login** (pedido identificado por telefone + token de rastreio na URL).
- Manager faz login → vai para painel do seu restaurante.
- Master Admin → painel global.
- Página `/auth` única com tabs Entrar / Criar conta, redirecionamento por role após login.

## 2. Painel Master Admin (`/admin`)

- Lista de restaurantes cadastrados (criar, editar status, ver dono).
- Tela de criação de restaurante + cadastro/atribuição de manager por email.
- KPIs simples: nº de restaurantes, pedidos hoje na rede, faturamento total do dia (sem gráficos avançados nesta fase).

## 3. Painel Manager (`/dashboard`)

Sidebar com seções:

- **Visão geral**: cards com pedidos de hoje, faturamento do dia, ticket médio.
- **Pedidos** (ver seção 4).
- **Cardápio**: CRUD de categorias e produtos com upload de imagem e toggle ativo/inativo.
- **Configurações da loja**: nome, logo, horário de funcionamento (por dia da semana), botão grande "Aberto/Fechado".

## 4. Pedidos em tempo real

- Lista de pedidos com filtro por status, atualização instantânea via Supabase Realtime.
- Card de pedido mostra itens, cliente, endereço, total.
- Botões para avançar status no fluxo. Som/notificação visual ao chegar pedido novo.
- Aba única "Delivery" nesta fase (a aba PDV entra na Fase 2).

## 5. Cardápio público + Checkout (`/r/:slug`)

- Página do restaurante: header com logo + status aberto/fechado, lista de categorias e produtos com foto, descrição e preço.
- Clique no produto → modal com qtd e observação → adiciona ao carrinho.
- Carrinho lateral (drawer) com totais.
- Checkout em etapa única:
  - Nome, telefone.
  - **CEP** com busca automática via ViaCEP → preenche rua/bairro/cidade/UF.
  - Número, complemento, observação do endereço.
  - Método de pagamento (Dinheiro / Pix / Cartão na entrega) + campo "troco para".
- Validação com Zod. Bloqueia checkout se loja fechada.
- Ao confirmar, gera pedido e redireciona para rastreamento.

## 6. Rastreamento do pedido (`/pedido/:token`)

- Página pública acessada por token único.
- Stepper visual com os status, atualizado em tempo real.
- Resumo do pedido, endereço e total.

## Detalhes técnicos

- Stack: React + Vite + Tailwind + shadcn/ui + react-router + TanStack Query + Zod + react-hook-form.
- Lovable Cloud (Supabase) para auth (apenas email/senha), DB, storage e realtime.
- Roles em tabela separada com função `has_role` SECURITY DEFINER (evita recursão de RLS e escalonamento de privilégio).
- RLS em todas as tabelas: managers só veem dados do próprio restaurante; cliente final lê pedido só pelo token; master admin vê tudo via `has_role`.
- Realtime via `supabase.channel().on('postgres_changes', ...)`.
- ViaCEP chamado direto do front (`https://viacep.com.br/ws/{cep}/json/`), sem secrets.
- Imagens via Supabase Storage com URLs públicas.

## Fora do escopo desta fase (entram nas próximas)

- PDV presencial.
- Promoções/cupons de delivery.
- Raio de entrega + cálculo de frete por distância.
- Dashboard com gráficos somando PDV + Delivery.
- Logs do sistema para o Master Admin.

Após aprovar este MVP, evoluímos em incrementos: Fase 2 = PDV + frete por raio; Fase 3 = promoções + dashboard com gráficos; Fase 4 = logs e refinamentos.
