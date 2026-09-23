-- ShopDesk OS - POS compatibility migration
-- Conserva las funciones existentes del POS durante la migracion de Supabase a PostgreSQL.
-- Revisar antes de ejecutar en cualquier base de datos.

alter table sales
  add column if not exists sale_channel text,
  add column if not exists shipping_cost numeric(14,2) not null default 0,
  add column if not exists card_fee numeric(14,2) not null default 0,
  add column if not exists net_received numeric(14,2) not null default 0,
  add column if not exists cash_received numeric(14,2) not null default 0,
  add column if not exists cash_change numeric(14,2) not null default 0,
  add column if not exists notes text;

alter table sale_items
  add column if not exists discount numeric(14,2) not null default 0;

alter table sale_payments
  add column if not exists reference text,
  add column if not exists card_fee numeric(14,2) not null default 0;

alter table credit_notes
  add column if not exists used_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
