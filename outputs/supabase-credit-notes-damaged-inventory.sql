-- Guatapo OS - Notas de credito, cambios y productos danados
-- Ejecutar en Supabase SQL Editor. No elimina datos existentes.

create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  credit_note_number text,
  fiscal_number text,
  refund_method text not null default 'credito',
  reason text not null,
  reason_other text,
  notes text,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'issued',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  credit_note_id uuid not null references public.credit_notes(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  restock_quantity numeric not null default 0 check (restock_quantity >= 0),
  damaged_quantity numeric not null default 0 check (damaged_quantity >= 0),
  disposition text not null default 'restock' check (disposition in ('restock', 'damaged', 'split')),
  reason text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint credit_note_item_quantities_match check (restock_quantity + damaged_quantity = quantity)
);

create table if not exists public.product_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  exchange_id uuid,
  product_id uuid references public.products(id) on delete set null,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  quantity numeric not null check (quantity > 0),
  reason text not null,
  notes text,
  disposition text not null check (disposition in ('restock', 'damaged')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.damaged_inventory (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete set null,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  exchange_id uuid,
  imei text,
  quantity numeric not null check (quantity > 0),
  reason text not null,
  notes text,
  status text not null default 'pending_review' check (
    status in ('pending_review', 'defective', 'repaired', 'returned_to_supplier', 'discarded', 'restored')
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete set null,
  restored_notes text
);

create table if not exists public.product_exchanges (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  exchange_number text,
  reason text not null,
  reason_other text,
  notes text,
  returned_total numeric not null default 0,
  replacement_total numeric not null default 0,
  difference numeric not null default 0,
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  difference_method text,
  status text not null default 'completed',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inventory_movements
  add column if not exists sale_id uuid references public.sales(id) on delete set null,
  add column if not exists credit_note_id uuid references public.credit_notes(id) on delete set null,
  add column if not exists exchange_id uuid,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists reason text;
alter table public.inventory_movements
  drop constraint if exists inventory_movements_movement_type_check;

alter table public.inventory_movements
  add constraint inventory_movements_movement_type_check
  check (movement_type in (
    'purchase',
    'sale',
    'adjustment',
    'return',
    'return_restock',
    'return_damaged',
    'damaged_restored',
    'exchange_return_restock',
    'exchange_return_damaged',
    'exchange_product_out'
  ));

create index if not exists credit_notes_store_created_idx on public.credit_notes(store_id, created_at desc);
create index if not exists credit_notes_sale_idx on public.credit_notes(sale_id);
create index if not exists credit_note_items_note_idx on public.credit_note_items(credit_note_id);
create index if not exists damaged_inventory_store_status_idx on public.damaged_inventory(store_id, status);
create index if not exists damaged_inventory_product_idx on public.damaged_inventory(product_id);
create index if not exists product_returns_sale_idx on public.product_returns(sale_id);

create or replace function public.next_credit_note_number(p_store_id uuid)
returns text
language plpgsql
as $$
declare
  next_number integer;
begin
  select count(*) + 1
  into next_number
  from public.credit_notes
  where store_id = p_store_id;

  return 'NC-' || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.process_credit_note(
  p_store_id uuid,
  p_sale_id uuid,
  p_refund_method text,
  p_reason text,
  p_reason_other text,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_credit_note_id uuid;
  item jsonb;
  product_row record;
  sale_item_row record;
  qty numeric;
  restock_qty numeric;
  damaged_qty numeric;
  unit_price numeric;
  tax_amount numeric;
  line_total numeric;
  all_sold_qty numeric;
  all_returned_qty numeric;
  previous_returned_qty numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecciona productos para la nota de credito.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Selecciona el motivo de la devolucion.';
  end if;

  if lower(p_reason) = 'otro' and nullif(trim(coalesce(p_reason_other, '')), '') is null then
    raise exception 'Explica el motivo de la devolucion.';
  end if;

  insert into public.credit_notes (
    store_id,
    sale_id,
    credit_note_number,
    refund_method,
    reason,
    reason_other,
    notes,
    created_by
  )
  values (
    p_store_id,
    p_sale_id,
    public.next_credit_note_number(p_store_id),
    coalesce(nullif(p_refund_method, ''), 'credito'),
    p_reason,
    nullif(p_reason_other, ''),
    nullif(p_notes, ''),
    current_user_id
  )
  returning id into new_credit_note_id;

  for item in select * from jsonb_array_elements(p_items)
  loop
    qty := coalesce((item->>'quantity')::numeric, 0);
    restock_qty := coalesce((item->>'restock_quantity')::numeric, 0);
    damaged_qty := coalesce((item->>'damaged_quantity')::numeric, 0);
    unit_price := coalesce((item->>'unit_price')::numeric, 0);
    tax_amount := coalesce((item->>'tax_amount')::numeric, 0);
    line_total := coalesce((item->>'total')::numeric, 0);

    if qty <= 0 or restock_qty < 0 or damaged_qty < 0 or restock_qty + damaged_qty <> qty then
      raise exception 'Cada producto devuelto debe tener destino valido.';
    end if;

    select *
    into sale_item_row
    from public.sale_items
    where id = (item->>'sale_item_id')::uuid
      and store_id = p_store_id
      and sale_id = p_sale_id
    for update;

    if not found then
      raise exception 'No se encontro uno de los productos de la venta.';
    end if;

    if qty > sale_item_row.quantity then
      raise exception 'La cantidad devuelta supera la cantidad vendida.';
    end if;

    select coalesce(sum(quantity), 0)
    into previous_returned_qty
    from public.credit_note_items
    where store_id = p_store_id
      and sale_item_id = sale_item_row.id;

    if previous_returned_qty + qty > sale_item_row.quantity then
      raise exception 'Este producto ya tiene devoluciones registradas que superan la cantidad vendida.';
    end if;

    insert into public.credit_note_items (
      store_id,
      credit_note_id,
      sale_id,
      sale_item_id,
      product_id,
      product_name,
      quantity,
      unit_price,
      tax_amount,
      total,
      restock_quantity,
      damaged_quantity,
      disposition,
      reason,
      notes
    )
    values (
      p_store_id,
      new_credit_note_id,
      p_sale_id,
      sale_item_row.id,
      sale_item_row.product_id,
      sale_item_row.product_name,
      qty,
      unit_price,
      tax_amount,
      line_total,
      restock_qty,
      damaged_qty,
      case when restock_qty > 0 and damaged_qty > 0 then 'split' when damaged_qty > 0 then 'damaged' else 'restock' end,
      p_reason,
      nullif(p_notes, '')
    );

    if sale_item_row.product_id is not null and restock_qty > 0 then
      select id, stock
      into product_row
      from public.products
      where id = sale_item_row.product_id
        and store_id = p_store_id
      for update;

      update public.products
      set stock = coalesce(stock, 0) + restock_qty
      where id = product_row.id
        and store_id = p_store_id;

      insert into public.inventory_movements (
        store_id,
        product_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reference_type,
        notes,
        sale_id,
        credit_note_id,
        created_by,
        reason
      )
      values (
        p_store_id,
        product_row.id,
        'return_restock',
        restock_qty,
        coalesce(product_row.stock, 0),
        coalesce(product_row.stock, 0) + restock_qty,
        'credit_note',
        p_notes,
        p_sale_id,
        new_credit_note_id,
        current_user_id,
        p_reason
      );
    end if;

    if sale_item_row.product_id is not null and damaged_qty > 0 then
      insert into public.damaged_inventory (
        store_id,
        product_id,
        sale_id,
        credit_note_id,
        imei,
        quantity,
        reason,
        notes,
        created_by
      )
      values (
        p_store_id,
        sale_item_row.product_id,
        p_sale_id,
        new_credit_note_id,
        sale_item_row.imei,
        damaged_qty,
        p_reason,
        p_notes,
        current_user_id
      );

      insert into public.inventory_movements (
        store_id,
        product_id,
        movement_type,
        quantity,
        previous_stock,
        new_stock,
        reference_type,
        notes,
        sale_id,
        credit_note_id,
        created_by,
        reason
      )
      values (
        p_store_id,
        sale_item_row.product_id,
        'return_damaged',
        damaged_qty,
        (select coalesce(stock, 0) from public.products where id = sale_item_row.product_id),
        (select coalesce(stock, 0) from public.products where id = sale_item_row.product_id),
        'credit_note',
        p_notes,
        p_sale_id,
        new_credit_note_id,
        current_user_id,
        p_reason
      );
    end if;

    insert into public.product_returns (
      store_id,
      sale_id,
      credit_note_id,
      product_id,
      sale_item_id,
      quantity,
      reason,
      notes,
      disposition,
      created_by
    )
    select p_store_id, p_sale_id, new_credit_note_id, sale_item_row.product_id, sale_item_row.id, restock_qty, p_reason, p_notes, 'restock', current_user_id
    where restock_qty > 0
    union all
    select p_store_id, p_sale_id, new_credit_note_id, sale_item_row.product_id, sale_item_row.id, damaged_qty, p_reason, p_notes, 'damaged', current_user_id
    where damaged_qty > 0;

    update public.credit_notes
    set
      subtotal = subtotal + greatest(0, line_total - tax_amount),
      tax_amount = credit_notes.tax_amount + tax_amount,
      total = credit_notes.total + line_total
    where id = new_credit_note_id;
  end loop;

  select coalesce(sum(quantity), 0)
  into all_sold_qty
  from public.sale_items
  where store_id = p_store_id
    and sale_id = p_sale_id;

  select coalesce(sum(quantity), 0)
  into all_returned_qty
  from public.credit_note_items
  where store_id = p_store_id
    and sale_id = p_sale_id;

  update public.sales
  set status = case
    when all_sold_qty > 0 and all_returned_qty >= all_sold_qty then 'refunded'
    else 'partially_refunded'
  end
  where id = p_sale_id
    and store_id = p_store_id;

  return new_credit_note_id;
end;
$$;

create or replace function public.restore_damaged_inventory(
  p_store_id uuid,
  p_damaged_inventory_id uuid,
  p_quantity numeric,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  damaged_row record;
  product_row record;
begin
  if p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select *
  into damaged_row
  from public.damaged_inventory
  where id = p_damaged_inventory_id
    and store_id = p_store_id
  for update;

  if not found then
    raise exception 'No se encontro el producto danado.';
  end if;

  if damaged_row.status = 'restored' then
    raise exception 'Este registro ya fue reintegrado.';
  end if;

  if p_quantity > damaged_row.quantity then
    raise exception 'No puedes reintegrar mas cantidad de la registrada como danada.';
  end if;

  select id, stock
  into product_row
  from public.products
  where id = damaged_row.product_id
    and store_id = p_store_id
  for update;

  update public.products
  set stock = coalesce(stock, 0) + p_quantity
  where id = product_row.id
    and store_id = p_store_id;

  insert into public.inventory_movements (
    store_id,
    product_id,
    movement_type,
    quantity,
    previous_stock,
    new_stock,
    reference_type,
    notes,
    sale_id,
    credit_note_id,
    created_by,
    reason
  )
  values (
    p_store_id,
    product_row.id,
    'damaged_restored',
    p_quantity,
    coalesce(product_row.stock, 0),
    coalesce(product_row.stock, 0) + p_quantity,
    'damaged_inventory',
    p_notes,
    damaged_row.sale_id,
    damaged_row.credit_note_id,
    current_user_id,
    damaged_row.reason
  );

  if p_quantity = damaged_row.quantity then
    update public.damaged_inventory
    set status = 'restored',
        restored_at = now(),
        restored_by = current_user_id,
        restored_notes = p_notes
    where id = damaged_row.id;
  else
    update public.damaged_inventory
    set quantity = quantity - p_quantity,
        restored_notes = p_notes
    where id = damaged_row.id;
  end if;
end;
$$;

alter table public.credit_notes enable row level security;
alter table public.credit_note_items enable row level security;
alter table public.product_returns enable row level security;
alter table public.damaged_inventory enable row level security;
alter table public.product_exchanges enable row level security;

drop policy if exists "credit_notes_store_access" on public.credit_notes;
create policy "credit_notes_store_access" on public.credit_notes
for all using (
  exists (select 1 from public.store_users su where su.store_id = credit_notes.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = credit_notes.store_id and su.user_id = auth.uid())
);

drop policy if exists "credit_note_items_store_access" on public.credit_note_items;
create policy "credit_note_items_store_access" on public.credit_note_items
for all using (
  exists (select 1 from public.store_users su where su.store_id = credit_note_items.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = credit_note_items.store_id and su.user_id = auth.uid())
);

drop policy if exists "product_returns_store_access" on public.product_returns;
create policy "product_returns_store_access" on public.product_returns
for all using (
  exists (select 1 from public.store_users su where su.store_id = product_returns.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = product_returns.store_id and su.user_id = auth.uid())
);

drop policy if exists "damaged_inventory_store_access" on public.damaged_inventory;
create policy "damaged_inventory_store_access" on public.damaged_inventory
for all using (
  exists (select 1 from public.store_users su where su.store_id = damaged_inventory.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = damaged_inventory.store_id and su.user_id = auth.uid())
);

drop policy if exists "product_exchanges_store_access" on public.product_exchanges;
create policy "product_exchanges_store_access" on public.product_exchanges
for all using (
  exists (select 1 from public.store_users su where su.store_id = product_exchanges.store_id and su.user_id = auth.uid())
)
with check (
  exists (select 1 from public.store_users su where su.store_id = product_exchanges.store_id and su.user_id = auth.uid())
);
