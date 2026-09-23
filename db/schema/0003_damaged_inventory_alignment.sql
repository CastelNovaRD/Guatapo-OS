-- Align damaged inventory metadata with the active exchange and restoration flows.
-- This migration is additive and is intended to run after 0002.

alter table damaged_inventory
  add column if not exists sale_id uuid,
  add column if not exists exchange_id uuid,
  add column if not exists imei text,
  add column if not exists notes text,
  add column if not exists reason_other text,
  add column if not exists original_stock numeric(14,3);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'damaged_inventory_sale_id_fkey') then
    alter table damaged_inventory add constraint damaged_inventory_sale_id_fkey foreign key (sale_id) references sales(id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'damaged_inventory_exchange_id_fkey') then
    alter table damaged_inventory add constraint damaged_inventory_exchange_id_fkey foreign key (exchange_id) references product_exchanges(id);
  end if;
end $$;

create index if not exists damaged_inventory_tenant_status_created_idx
  on damaged_inventory (organization_id, installation_id, store_id, status, created_at desc);
