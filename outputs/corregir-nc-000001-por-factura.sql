-- ShopDesk OS - Aplicar NC-000001 a una factura especifica
-- INSTRUCCION: cambia FAC-000000 por el numero real de la factura donde se uso la nota.
-- Ejemplo: target_invoice_number text := 'FAC-000026';
-- No borra datos. Registra la nota en sale_payments, marca la nota como usada y corrige el cuadre.

begin;

do $$
declare
  target_invoice_number text := 'FAC-000000'; -- <-- CAMBIA ESTO
  target_note record;
  target_sale record;
  existing_credit_payment_count integer := 0;
  note_amount numeric := 0;
  normal_business_amount numeric := 0;
  normal_payment_kind text := 'transfer';
  payment_method_name text := '';
begin
  if target_invoice_number = 'FAC-000000' then
    raise exception 'Debes cambiar target_invoice_number por el numero real de la factura.';
  end if;

  select *
    into target_note
  from public.credit_notes
  where credit_note_number = 'NC-000001'
  order by created_at desc
  limit 1;

  if target_note.id is null then
    raise exception 'No encontre la nota de credito NC-000001.';
  end if;

  select *
    into target_sale
  from public.sales
  where store_id = target_note.store_id
    and invoice_number = target_invoice_number
  limit 1;

  if target_sale.id is null then
    raise exception 'No encontre la factura % en la misma tienda de NC-000001.', target_invoice_number;
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

  note_amount := least(
    coalesce(target_note.available_balance, target_note.total, 0),
    coalesce(target_note.total, 0),
    greatest(coalesce(target_sale.total, 0) - coalesce(target_sale.card_fee, 0), 0)
  );

  if note_amount <= 0 then
    raise exception 'NC-000001 no tiene monto disponible para aplicar.';
  end if;

  -- Evita duplicar desglose si la factura ya tenia pagos detallados.
  delete from public.sale_payments
  where store_id = target_note.store_id
    and sale_id = target_sale.id;

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

  raise notice 'NC-000001 aplicada a %. Monto nota: %, faltante registrado: % como %.', target_invoice_number, note_amount, normal_business_amount, normal_payment_kind;
end $$;

commit;

notify pgrst, 'reload schema';
