
# Fundação da Plataforma Documental

Esta fase entrega a base sobre a qual todos os módulos do PRD (upload, OCR, GED, créditos, workflow, auditoria) serão construídos.

## Escopo desta entrega

1. **Lovable Cloud (Supabase)** — habilitar backend gerenciado.
2. **Autenticação** — email/senha + Google. Página `/auth` (login + cadastro) e `/reset-password`.
3. **Multi-tenant (organizações)** — cada usuário pertence a uma ou mais organizações ("clientes"). Toda tabela de negócio carrega `org_id`, com RLS isolando por organização. Seleção de organização ativa no header.
4. **Perfis de acesso (RBAC)** — 4 papéis conforme PRD §6:
   - `platform_admin` — admin da plataforma (cross-tenant, define preços/créditos)
   - `org_admin` — admin do cliente
   - `operator` — operador documental
   - `viewer` — visualizador
   Implementado via tabela `user_roles` separada + função `has_role()` SECURITY DEFINER.
5. **Shell de UI** — sidebar com navegação para todos os módulos futuros (Dashboard, Upload, Fila, Documentos, Grupos, Templates, Workflow, Retenção, Auditoria, Créditos, Configurações, Admin Plataforma), header com seletor de organização, avatar/logout. Páginas-stub com "Em breve" para módulos não implementados.
6. **Design system** — paleta sóbria B2B (azul-petróleo profundo + neutros quentes), tipografia "Plus Jakarta Sans" (display) + "Inter" (body), tokens em `src/styles.css`. Sem roxo. Suporte a tema escuro.
7. **Landing pública** (`/`) — apresentação curta do produto + CTA para login.

## Não está nesta entrega (próximas fases)

Upload real, OCR/IA, GED, templates, créditos/Stripe, workflow, retenção, auditoria avançada, dashboard com métricas reais. Os menus existem mas levam a páginas-stub.

## Detalhes técnicos

### Tabelas (migration única)
- `organizations(id, name, slug, created_at)`
- `organization_members(org_id, user_id, created_at, primary key (org_id, user_id))`
- `profiles(id references auth.users, full_name, avatar_url, current_org_id)` — auto-criado por trigger no signup
- `app_role` enum: `platform_admin | org_admin | operator | viewer`
- `user_roles(id, user_id, org_id nullable, role)` — `org_id` nulo para `platform_admin`
- Função `public.has_role(_user_id, _org_id, _role)` SECURITY DEFINER
- RLS em todas as tabelas + GRANTs explícitos para `authenticated` e `service_role`
- Trigger `on_auth_user_created` → cria `profiles` + organização default + membership + role `org_admin`

### Rotas (TanStack Start)
- `/` — landing pública
- `/auth` — login/cadastro (Google + email)
- `/reset-password` — definir nova senha
- `/_authenticated/route.tsx` — gate gerenciado (já existe ao habilitar Cloud)
- `/_authenticated/dashboard` — home logada
- `/_authenticated/upload`, `/queue`, `/documents`, `/groups`, `/templates`, `/workflow`, `/retention`, `/audit`, `/credits`, `/settings` — stubs
- `/_authenticated/admin` — gated por `platform_admin`

### Componentes-chave
- `AppShell` (sidebar + topbar) usando `components/ui/sidebar.tsx`
- `OrgSwitcher` no topbar
- `useCurrentOrg()` hook lendo `profiles.current_org_id`
- `<RoleGate role="...">` para esconder itens de menu

## Confirmação

Posso prosseguir com esta fundação? O design segue paleta sóbria B2B (azul-petróleo + neutros, sem roxo), já que você não indicou preferência específica.
