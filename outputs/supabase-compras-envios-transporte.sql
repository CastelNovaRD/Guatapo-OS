-- ShopDesk OS - Compras: Envios / Transporte y costo promedio ponderado.
-- Ejecutar en Supabase si el modulo Compras ya fue instalado.

alter table public.purchases
  add column if not exists shipping_transport_cost numeric not null default 0,
  add column if not exists expense_notes text;

comment on column public.purchases.shipping_transport_cost is
'Gastos de envios, transporte, gasolina, delivery, flete, peajes o mensajeria asociados a la compra.';

comment on column public.purchases.other_expenses is
'Otros gastos adicionales de la compra. El total adicional es shipping_transport_cost + other_expenses.';

create or replace function public.receive_purchase(p_store_id uuid, p_purchase_id uuid, p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
as $$
declare
  purchase_row record;
  item_row record;
  product_row record;
  previous_stock numeric;
  previous_cost numeric;
  target_received_qty numeric;
  previous_received_qty numeric;
  received_qty numeric;
  real_cost numeric;
  new_stock numeric;
  new_cost numeric;
  processed integer := 0;
  total_received_units numeric := 0;
  additional_expense_unit numeric := 0;
begin
  select * into purchase_row
  from public.purchases
  where id = p_purchase_id and store_id = p_store_id
  for update;

  if not found then
    raise exception 'Compra no encontrada.';
  end if;

  if purchase_row.status in ('received', 'cancelled') then
    raise exception 'Esta compra ya fue recibida o cancelada.';
  end if;

  select coalesce(sum(
    case
      when coalesce(received_quantity, 0) > 0 then least(coalesce(received_quantity, 0), coalesce(quantity, 0))
      else coalesce(quantity, 0)
    end
  ), 0)
  into total_received_units
  from public.purchase_items
  where purchase_id = p_purchase_id and store_id = p_store_id;

  additional_expense_unit := case
    when total_received_units > 0
      then (coalesce(purchase_row.shipping_transport_cost, 0) + coalesce(purchase_row.other_expenses, 0)) / total_received_units
    else 0
  end;

  for item_row in
    select * from public.purchase_items
    where purchase_id = p_purchase_id and store_id = p_store_id
    order by id
  loop
    previous_received_qty := 0;
    target_received_qty := case
      when coalesce(item_row.received_quantity, 0) > 0 then least(coalesce(item_row.received_quantity, 0), coalesce(item_row.quantity, 0))
      else coalesce(item_row.quantity, 0)
    end;
    received_qty := target_received_qty - previous_received_qty;
    if received_qty <= 0 then
      continue;
    end if;

    select * into product_row
    from public.products
    where id = item_row.product_id and store_id = p_store_id
    for update;

    if not found then
      raise exception 'Producto no encontrado en la compra: %', item_row.product_name;
    end if;

    previous_stock := coalesce(product_row.stock, 0);
    previous_cost := coalesce(product_row.cost, 0);
    real_cost := coalesce(item_row.unit_cost, 0) + additional_expense_unit;
    new_stock := previous_stock + received_qty;

    if new_stock <= 0 then
      new_cost := real_cost;
    else
      new_cost := ((previous_stock * previous_cost) + (received_qty * real_cost)) / new_stock;
    end if;

    update public.products
    set stock = new_stock,
        cost = new_cost,
        updated_at = now()
    where id = product_row.id and store_id = p_store_id;

    update public.purchase_items
    set received_quantity = received_qty,
        other_expense_unit = additional_expense_unit,
        real_unit_cost = real_cost,
        previous_stock = previous_stock,
        new_stock = new_stock,
        previous_avg_cost = previous_cost,
        new_avg_cost = new_cost
    where id = item_row.id and store_id = p_store_id;

    insert into public.inventory_movements (
      store_id, product_id, movement_type, quantity, previous_stock, new_stock,
      reference_type, reference_id, notes
    ) values (
      p_store_id, product_row.id, 'purchase_receipt', received_qty, previous_stock, new_stock,
      'purchase', p_purchase_id,
      'Recepcion de compra ' || coalesce(purchase_row.invoice_number, p_purchase_id::text)
    );

    processed := processed + 1;
  end loop;

  update public.purchases
  set status = case
        when exists (select 1 from public.purchase_items where purchase_id = p_purchase_id and store_id = p_store_id and coalesce(received_quantity, 0) < coalesce(quantity, 0)) then 'partially_received'
        else 'received'
      end,
      cost_rule = 'weighted_average',
      received_at = now(),
      received_date = coalesce(received_date, current_date),
      received_by = p_user_id,
      updated_at = now()
  where id = p_purchase_id and store_id = p_store_id;

  insert into public.audit_logs (store_id, module, action, entity_type, entity_id, summary, metadata)
  values (
    p_store_id, 'compras', 'purchase.received', 'purchase', p_purchase_id,
    'Compra recibida y costo promedio actualizado.',
    jsonb_build_object(
      'items_processed', processed,
      'cost_rule', 'weighted_average',
      'shipping_transport_cost', coalesce(purchase_row.shipping_transport_cost, 0),
      'other_expenses', coalesce(purchase_row.other_expenses, 0),
      'additional_expense_unit', additional_expense_unit
    )
  );

  return jsonb_build_object('ok', true, 'items_processed', processed, 'additional_expense_unit', additional_expense_unit);
end;
$$;
