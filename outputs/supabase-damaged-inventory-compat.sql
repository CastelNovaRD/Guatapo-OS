-- ShopDesk OS - Compatibilidad para inventario danado en cambios
-- Ejecutar en Supabase SQL Editor si deseas guardar trazabilidad completa.

begin;

alter table if exists public.damaged_inventory
  add column if not exists sale_item_id uuid references public.sale_items(id) on delete set null,
  add column if not exists reason_other text,
  add column if not exists original_stock numeric not null default 0;

-- Permite el estado usado anteriormente por algunas pantallas, sin romper los estados existentes.
alter table if exists public.damaged_inventory
  drop constraint if exists damaged_inventory_status_check;

alter table if exists public.damaged_inventory
  add constraint damaged_inventory_status_check
  check (status in ('pending_review', 'damaged', 'defective', 'repaired', 'returned_to_supplier', 'discarded', 'restored'));

create index if not exists damaged_inventory_sale_item_idx on public.damaged_inventory(sale_item_id);

commit;

notify pgrst, 'reload schema';
