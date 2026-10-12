-- Guatapo OS - Banners administrables para la tienda web.
-- Ejecutar manualmente en Supabase SQL Editor. No modifica productos, ventas ni datos existentes.

begin;

create table if not exists public.web_banners (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  image_url text not null,
  mobile_image_url text,
  title text,
  subtitle text,
  link_url text,
  button_text text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists web_banners_store_active_order_idx
  on public.web_banners(store_id, is_active, display_order, created_at);

alter table public.web_banners enable row level security;

drop policy if exists "web_banners_public_read_active" on public.web_banners;
create policy "web_banners_public_read_active" on public.web_banners
for select to anon using (is_active = true);

drop policy if exists "web_banners_store_manage" on public.web_banners;
create policy "web_banners_store_manage" on public.web_banners
for all to authenticated
using (exists (
  select 1 from public.store_users su
  where su.store_id = web_banners.store_id and su.user_id = auth.uid()
))
with check (exists (
  select 1 from public.store_users su
  where su.store_id = web_banners.store_id and su.user_id = auth.uid()
));

commit;

notify pgrst, 'reload schema';
