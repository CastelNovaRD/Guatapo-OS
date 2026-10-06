-- Modulo de empleados / recursos humanos por tienda
-- Ejecutar en Supabase SQL Editor del proyecto de Guatapo OS.

create extension if not exists pgcrypto;

alter table if exists public.store_users
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  phone text,
  cedula text,
  salary numeric(12,2) not null default 0,
  position text,
  role text not null default 'seller',
  permissions jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  notes text,
  hired_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, cedula)
);

create index if not exists employees_store_idx on public.employees (store_id);
create index if not exists employees_auth_user_idx on public.employees (auth_user_id);
create index if not exists employees_active_idx on public.employees (store_id, active);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_touch_updated_at on public.employees;
create trigger employees_touch_updated_at
  before update on public.employees
  for each row
  execute function public.touch_updated_at();

alter table public.employees enable row level security;

create or replace function public.current_user_can_manage_employees(check_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.store_users su
    where su.store_id = check_store_id
      and su.user_id = auth.uid()
      and su.active = true
      and (
        lower(coalesce(su.role, '')) in ('owner', 'admin', 'administrador', 'manager')
        or coalesce((su.permissions ->> 'employees.manage')::boolean, false) = true
      )
  );
$$;

drop policy if exists "employees_select_by_managers" on public.employees;
create policy "employees_select_by_managers"
  on public.employees
  for select
  using (public.current_user_can_manage_employees(store_id));

drop policy if exists "employees_insert_by_managers" on public.employees;
create policy "employees_insert_by_managers"
  on public.employees
  for insert
  with check (public.current_user_can_manage_employees(store_id));

drop policy if exists "employees_update_by_managers" on public.employees;
create policy "employees_update_by_managers"
  on public.employees
  for update
  using (public.current_user_can_manage_employees(store_id))
  with check (public.current_user_can_manage_employees(store_id));

drop policy if exists "employees_delete_by_managers" on public.employees;
create policy "employees_delete_by_managers"
  on public.employees
  for delete
  using (public.current_user_can_manage_employees(store_id));
