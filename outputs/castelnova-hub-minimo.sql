-- CastelNova Hub - estructura minima para controlar instalaciones.
-- Ejecutar en el proyecto Supabase del Hub, no en la base operativa de Guatapo OS.

create extension if not exists pgcrypto;

create table if not exists public.hub_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.hub_installations (
  id uuid primary key default gen_random_uuid(),
  installation_id text not null unique,
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  plan_id uuid references public.hub_plans(id),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'maintenance', 'expired')),
  current_version text not null default '1.0.0',
  latest_version text not null default '1.0.0',
  installation_key_hash text not null,
  domain text,
  maintenance_message text,
  license_expires_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_installation_modules (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.hub_installations(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (installation_id, module_key)
);

create table if not exists public.hub_notifications (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.hub_installations(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'danger')),
  href text,
  read boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.hub_audit_logs (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid references public.hub_installations(id) on delete set null,
  action text not null,
  detail text,
  actor text,
  created_at timestamptz not null default now()
);

insert into public.hub_organizations (name, slug, status)
values ('Guatapo', 'guatapo', 'active')
on conflict (slug) do update
set name = excluded.name,
    status = excluded.status,
    updated_at = now();

insert into public.hub_plans (name, description)
values ('Premium interno', 'Licencia interna sin vencimiento para Guatapo.')
on conflict (name) do nothing;

with org as (
  select id from public.hub_organizations where slug = 'guatapo'
),
plan as (
  select id from public.hub_plans where name = 'Premium interno'
)
insert into public.hub_installations (
  installation_id,
  organization_id,
  plan_id,
  name,
  status,
  current_version,
  latest_version,
  installation_key_hash,
  license_expires_at
)
select
  'guatapo-os-production',
  org.id,
  plan.id,
  'Guatapo OS',
  'active',
  '1.0.0',
  '1.0.0',
  crypt('CAMBIA_ESTA_CLAVE_SEGURA', gen_salt('bf')),
  null
from org, plan
on conflict (installation_id) do update
set organization_id = excluded.organization_id,
    plan_id = excluded.plan_id,
    name = excluded.name,
    status = excluded.status,
    current_version = excluded.current_version,
    latest_version = excluded.latest_version,
    updated_at = now();

with installation as (
  select id from public.hub_installations where installation_id = 'guatapo-os-production'
),
modules(module_key) as (
  values
    ('dashboard'),
    ('pos'),
    ('inventory'),
    ('purchases'),
    ('sales'),
    ('customers'),
    ('quotes'),
    ('cash_registers'),
    ('cooperatives'),
    ('accounts_receivable'),
    ('reports'),
    ('online_store'),
    ('settings'),
    ('audit'),
    ('employees')
)
insert into public.hub_installation_modules (installation_id, module_key, enabled)
select installation.id, modules.module_key, true
from installation, modules
on conflict (installation_id, module_key) do update
set enabled = excluded.enabled;
