-- Auditoria y permisos por usuario para CastelNova OS / Guatapo OS
-- Ejecutar en Supabase SQL Editor del proyecto correspondiente.

create extension if not exists pgcrypto;

alter table if exists public.store_users
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  user_email text,
  module text not null,
  action text not null,
  entity_type text,
  entity_id text,
  summary text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_store_created_idx
  on public.audit_logs (store_id, created_at desc);

create index if not exists audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);

create index if not exists audit_logs_module_action_idx
  on public.audit_logs (module, action);

alter table public.audit_logs enable row level security;

create or replace function public.is_platform_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = check_user_id
  );
$$;

create or replace function public.current_user_can_view_audit(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.store_users su
      where su.store_id = check_store_id
        and su.user_id = auth.uid()
        and su.active = true
        and (
          lower(coalesce(su.role, '')) in ('owner', 'admin', 'administrador')
          or coalesce((su.permissions ->> 'audit.view')::boolean, false) = true
        )
    );
$$;

create or replace function public.current_user_can_write_audit(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.store_users su
      where su.store_id = check_store_id
        and su.user_id = auth.uid()
        and su.active = true
    );
$$;

drop policy if exists "audit_logs_select_by_store_members" on public.audit_logs;
create policy "audit_logs_select_by_store_members"
  on public.audit_logs
  for select
  using (public.current_user_can_view_audit(store_id));

drop policy if exists "audit_logs_insert_by_store_members" on public.audit_logs;
create policy "audit_logs_insert_by_store_members"
  on public.audit_logs
  for insert
  with check (public.current_user_can_write_audit(store_id));

-- Permite que dueños/admins y platform admins administren permisos en store_users.
-- Si ya tienes políticas más estrictas, puedes dejar estas junto a las existentes.
drop policy if exists "store_users_update_permissions_by_admins" on public.store_users;
create policy "store_users_update_permissions_by_admins"
  on public.store_users
  for update
  using (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.store_users admin_user
      where admin_user.store_id = store_users.store_id
        and admin_user.user_id = auth.uid()
        and admin_user.active = true
        and lower(coalesce(admin_user.role, '')) in ('owner', 'admin', 'administrador')
    )
  )
  with check (
    public.is_platform_admin(auth.uid())
    or exists (
      select 1
      from public.store_users admin_user
      where admin_user.store_id = store_users.store_id
        and admin_user.user_id = auth.uid()
        and admin_user.active = true
        and lower(coalesce(admin_user.role, '')) in ('owner', 'admin', 'administrador')
    )
  );
