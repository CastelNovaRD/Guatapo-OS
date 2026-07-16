alter table public.sales
add column if not exists shipping_cost numeric(12, 2) not null default 0;

comment on column public.sales.shipping_cost is
'Costo de envio cobrado al cliente. No se considera ganancia del local.';
