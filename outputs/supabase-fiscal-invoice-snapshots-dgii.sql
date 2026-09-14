-- Safe additive migration. Existing invoices and records remain unchanged.
alter table public.sales
  add column if not exists fiscal_notes text,
  add column if not exists fiscal_customer_source text;

-- The official DGII dataset is intentionally empty until an approved server-side import is connected.
create table if not exists public.dgii_contributors (
  document text primary key,
  registered_name text not null,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now()
);
alter table public.dgii_contributors enable row level security;
-- Do not grant client read/write access here. Connect the approved dataset through a secured server-side provider.
