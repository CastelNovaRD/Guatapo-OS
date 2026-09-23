-- ShopDesk OS - POS, caja, pagos y cambios v1
-- Ejecutar en Supabase SQL Editor. No borra datos existentes.

begin;

-- 1) Compatibilidad del sistema de cambios.
alter table if exists public.product_exchanges
  add column if not exists difference_total numeric not null default 0,
  add column if not exists exchange_type text,
  add column if not exists credit_note_id uuid references public.credit_notes(id) on delete set null,
  add column if not exists payment_status text not null default 'paid';

update public.product_exchanges
set difference_total = coalesce(difference_total, difference, 0)
where difference_total = 0 and coalesce(difference, 0) <> 0;

-- 2) Movimientos de caja para retiros/depositos/ajustes.
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cash_register_id uuid not null references public.cash_registers(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  movement_type text not null,
  amount numeric not null,
  reason text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint cash_movements_amount_check check (amount > 0),
  constraint cash_movements_movement_type_check check (movement_type in ('withdrawal', 'deposit', 'adjustment'))
);

create index if not exists cash_movements_store_created_idx on public.cash_movements(store_id, created_at desc);
create index if not exists cash_movements_register_idx on public.cash_movements(cash_register_id);

alter table public.cash_movements enable row level security;

drop policy if exists "cash_movements_store_access" on public.cash_movements;
create policy "cash_movements_store_access" on public.cash_movements
for all using (
  exists (select 1 from public.store_users su where su.store_id = cash_movements.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = cash_movements.store_id and su.user_id = auth.uid())
);

-- 3) Preparacion para pagos combinados y nota de credito como metodo de pago.
create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method text not null,
  amount numeric not null,
  reference text,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  card_fee numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint sale_payments_amount_check check (amount > 0),
  constraint sale_payments_method_check check (payment_method in ('cash', 'transfer', 'card', 'credit_note'))
);

create index if not exists sale_payments_store_sale_idx on public.sale_payments(store_id, sale_id);
create index if not exists sale_payments_credit_note_idx on public.sale_payments(credit_note_id);

alter table public.sale_payments enable row level security;

drop policy if exists "sale_payments_store_access" on public.sale_payments;
create policy "sale_payments_store_access" on public.sale_payments
for all using (
  exists (select 1 from public.store_users su where su.store_id = sale_payments.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = sale_payments.store_id and su.user_id = auth.uid())
);

-- 4) Campos de saldo para notas de credito existentes.
alter table if exists public.credit_notes
  add column if not exists original_amount numeric,
  add column if not exists available_balance numeric,
  add column if not exists used_at timestamptz,
  add column if not exists updated_at timestamptz;

update public.credit_notes
set original_amount = coalesce(original_amount, total, 0),
    available_balance = coalesce(available_balance, total, 0)
where original_amount is null or available_balance is null;

alter table if exists public.credit_notes
  add constraint credit_notes_balance_non_negative check (available_balance is null or available_balance >= 0) not valid;

commit;

notify pgrst, 'reload schema';
