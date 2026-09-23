-- ShopDesk OS - Correccion puntual NC-000001 usada hoy
-- Ejecutar en Supabase SQL Editor SOLO si NC-000001 fue usada hoy y no aparece en ventas/cuadre.
-- No borra datos. Inserta el pago de nota de credito faltante y marca la nota como usada.

begin;

do $$
declare
  target_note record;
  target_sale record;
  existing_credit_payment_count integer := 0;
  note_amount numeric := 0;
  normal_business_amount numeric := 0;
  normal_payment_kind text := 'transfer';
  payment_method_name text := '';
begin
  select *
    into target_note
  from public.credit_notes
  where credit_note_number = 'NC-000001'
  order by created_at desc
  limit 1;

  if target_note.id is null then
    raise exception 'No encontre la nota de credito NC-000001.';
  end if;

  select count(*)
    into existing_credit_payment_count
  from public.sale_payments
  where store_id = target_note.store_id
    and credit_note_id = target_note.id
    and payment_method = 'credit_note';

  if existing_credit_payment_count > 0 then
    update public.credit_notes
       set available_balance = 0,
           used_at = coalesce(used_at, now()),
           updated_at = now()
     where id = target_note.id;

    raise notice 'NC-000001 ya tenia pago registrado. Solo se aseguro como usada.';
    return;
  end if;

  -- Busca la venta de hoy vinculada por la nota en el campo notes.
  -- Si no la encuentra, NO adivina para evitar corregir la factura equivocada.
  select s.*
    into target_sale
  from public.sales s
  where s.store_id = target_note.store_id
    and s.created_at::date = current_date
    and (
      coalesce(s.notes, '') ilike '%NC-000001%'
      or coalesce(s.notes, '') ilike '%nota de credito%'
    )
  order by s.created_at desc
  limit 1;

  if target_sale.id is null then
    raise exception 'No encontre una venta de hoy vinculada a NC-000001. No se aplico ningun cambio para evitar afectar una venta incorrecta.';
  end if;

  note_amount := least(
    coalesce(target_note.available_balance, target_note.total, 0),
    greatest(coalesce(target_note.total, 0), 0),
    greatest(coalesce(target_sale.total, 0) - coalesce(target_sale.card_fee, 0), 0)
  );

  if note_amount <= 0 then
    raise exception 'NC-000001 no tiene monto disponible para aplicar.';
  end if;

  insert into public.sale_payments (
    store_id,
    sale_id,
    payment_method,
    amount,
    reference,
    credit_note_id,
    card_fee
  ) values (
    target_note.store_id,
    target_sale.id,
    'credit_note',
    note_amount,
    target_note.credit_note_number,
    target_note.id,
    0
  );

  normal_business_amount := greatest(coalesce(target_sale.total, 0) - coalesce(target_sale.card_fee, 0) - note_amount, 0);

  if normal_business_amount > 0 then
    if target_sale.payment_method_id is not null then
      select lower(coalesce(name, ''))
        into payment_method_name
      from public.payment_methods
      where id = target_sale.payment_method_id;
    end if;

    if coalesce(target_sale.cash_received, 0) > 0 or payment_method_name like '%efectivo%' then
      normal_payment_kind := 'cash';
    elsif coalesce(target_sale.card_fee, 0) > 0 or payment_method_name like '%tarjeta%' or payment_method_name like '%card%' then
      normal_payment_kind := 'card';
    else
      normal_payment_kind := 'transfer';
    end if;

    insert into public.sale_payments (
      store_id,
      sale_id,
      payment_method,
      amount,
      reference,
      credit_note_id,
      card_fee
    ) values (
      target_note.store_id,
      target_sale.id,
      normal_payment_kind,
      normal_business_amount,
      null,
      null,
      case when normal_payment_kind = 'card' then coalesce(target_sale.card_fee, 0) else 0 end
    );
  end if;

  update public.credit_notes
     set original_amount = coalesce(original_amount, total, note_amount),
         available_balance = 0,
         used_at = coalesce(used_at, now()),
         updated_at = now()
   where id = target_note.id;

  update public.sales
     set notes = trim(coalesce(notes, '') || ' | Nota de credito aplicada: NC-000001')
   where id = target_sale.id
     and coalesce(notes, '') not ilike '%NC-000001%';

  raise notice 'NC-000001 aplicada a la venta %. Monto nota: %, faltante registrado: %.', target_sale.invoice_number, note_amount, normal_business_amount;
end $$;

commit;

notify pgrst, 'reload schema';
