-- ShopDesk OS
-- Consecutivos de facturas por tienda.
--
-- Cada tienda mantiene su propia numeracion:
-- FAC-0001, FAC-0002, FAC-0003, ...
--
-- La asignacion se realiza dentro de PostgreSQL para evitar que
-- dos ventas concurrentes reciban el mismo numero.

create table if not exists sale_invoice_counters (
  organization_id uuid not null,
  installation_id uuid not null,
  store_id uuid not null,
  next_number bigint not null default 1,

  constraint sale_invoice_counters_pkey
    primary key (organization_id, installation_id, store_id),

  constraint sale_invoice_counters_store_fkey
    foreign key (store_id, organization_id, installation_id)
    references stores(id, organization_id, installation_id),

  constraint sale_invoice_counters_next_number_check
    check (next_number >= 1)
);

create unique index if not exists sales_store_invoice_number_unique
  on sales (store_id, invoice_number)
  where invoice_number is not null;

create or replace function next_sale_invoice_number(
  p_organization_id uuid,
  p_installation_id uuid,
  p_store_id uuid
)
returns text
language plpgsql
as $$
declare
  v_number bigint;
begin
  insert into sale_invoice_counters (
    organization_id,
    installation_id,
    store_id,
    next_number
  )
  values (
    p_organization_id,
    p_installation_id,
    p_store_id,
    2
  )
  on conflict (organization_id, installation_id, store_id)
  do update
    set next_number = sale_invoice_counters.next_number + 1
  returning next_number - 1 into v_number;

  return 'FAC-' || lpad(v_number::text, 4, '0');
end;
$$;