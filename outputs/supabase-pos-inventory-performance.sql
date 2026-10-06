-- Guatapo OS - rendimiento de Inventario y POS
-- Ejecutar en Supabase SQL Editor del proyecto de Guatapo.
-- No elimina datos. Agrega configuración, una función RPC y índices seguros.

alter table public.stores
  add column if not exists pos_featured_products_limit integer not null default 10;

alter table public.stores
  drop constraint if exists stores_pos_featured_products_limit_check;

alter table public.stores
  add constraint stores_pos_featured_products_limit_check
  check (pos_featured_products_limit in (5, 10, 20, 50));

create index if not exists products_store_active_stock_idx
  on public.products (store_id, active, stock);

create index if not exists products_store_category_idx
  on public.products (store_id, category);

create index if not exists products_store_created_idx
  on public.products (store_id, created_at desc);

create index if not exists sale_items_store_product_idx
  on public.sale_items (store_id, product_id);

create index if not exists sale_items_store_sale_idx
  on public.sale_items (store_id, sale_id);

create index if not exists sales_store_status_created_idx
  on public.sales (store_id, status, created_at desc);

create index if not exists credit_note_items_store_sale_item_idx
  on public.credit_note_items (store_id, sale_item_id);

create or replace function public.get_pos_featured_products(
  p_store_id uuid,
  p_limit integer default 10
)
returns table (
  id uuid,
  name text,
  sku text,
  barcode text,
  image_url text,
  sale_price numeric,
  cost numeric,
  stock numeric,
  product_type text,
  category text,
  units_sold numeric,
  last_sold_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with safe_limit as (
    select case when p_limit in (5, 10, 20, 50) then p_limit else 10 end as value
  ),
  returned_items as (
    select
      cni.sale_item_id,
      sum(coalesce(cni.quantity, 0))::numeric as returned_quantity
    from public.credit_note_items cni
    where cni.store_id = p_store_id
    group by cni.sale_item_id
  ),
  ranked_sales as (
    select
      si.product_id,
      sum(greatest(0, coalesce(si.quantity, 0) - coalesce(ri.returned_quantity, 0)))::numeric as units_sold,
      max(s.created_at) as last_sold_at
    from public.sale_items si
    join public.sales s
      on s.id = si.sale_id
     and s.store_id = p_store_id
    left join returned_items ri
      on ri.sale_item_id = si.id
    where si.store_id = p_store_id
      and si.product_id is not null
      and coalesce(s.status, 'paid') not in ('cancelled', 'canceled', 'refunded', 'void', 'anulada', 'anulado')
    group by si.product_id
  ),
  available_products as (
    select
      p.id,
      p.name::text as name,
      p.sku::text as sku,
      p.barcode::text as barcode,
      p.image_url::text as image_url,
      p.sale_price::numeric as sale_price,
      p.cost::numeric as cost,
      p.stock::numeric as stock,
      p.product_type::text as product_type,
      p.category::text as category,
      coalesce(rs.units_sold, 0)::numeric as units_sold,
      rs.last_sold_at,
      row_number() over (
        order by
          case when rs.units_sold is null or rs.units_sold <= 0 then 1 else 0 end,
          coalesce(rs.units_sold, 0) desc,
          rs.last_sold_at desc nulls last,
          p.name asc
      ) as sort_order
    from public.products p
    left join ranked_sales rs
      on rs.product_id = p.id
    where p.store_id = p_store_id
      and p.active is not false
      and coalesce(p.stock, 0) > 0
  )
  select
    ap.id,
    ap.name,
    ap.sku,
    ap.barcode,
    ap.image_url,
    ap.sale_price,
    ap.cost,
    ap.stock,
    ap.product_type,
    ap.category,
    ap.units_sold,
    ap.last_sold_at
  from available_products ap
  where ap.sort_order <= (select value from safe_limit)
  order by ap.sort_order;
$$;
create or replace function public.get_inventory_summary(p_store_id uuid)
returns table (
  active_count bigint,
  inventory_value numeric,
  inventory_sale_value numeric,
  low_stock_count bigint,
  out_of_stock_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where p.active is not false) as active_count,
    coalesce(sum(coalesce(p.cost, 0) * coalesce(p.stock, 0)) filter (where p.active is not false), 0)::numeric as inventory_value,
    coalesce(sum(coalesce(p.sale_price, 0) * coalesce(p.stock, 0)) filter (where p.active is not false), 0)::numeric as inventory_sale_value,
    count(*) filter (where p.active is not false and coalesce(p.stock, 0) > 0 and coalesce(p.stock, 0) <= 2) as low_stock_count,
    count(*) filter (where p.active is not false and coalesce(p.stock, 0) <= 0) as out_of_stock_count
  from public.products p
  where p.store_id = p_store_id;
$$;
-- Limites de productos visibles en POS Cooperativa y Cotizaciones
alter table public.stores
  add column if not exists cooperative_pos_products_limit integer not null default 10;

alter table public.stores
  add column if not exists quote_products_limit integer not null default 10;

alter table public.stores
  drop constraint if exists stores_cooperative_pos_products_limit_check;

alter table public.stores
  add constraint stores_cooperative_pos_products_limit_check
  check (cooperative_pos_products_limit in (5, 10, 20, 50));

alter table public.stores
  drop constraint if exists stores_quote_products_limit_check;

alter table public.stores
  add constraint stores_quote_products_limit_check
  check (quote_products_limit in (5, 10, 20, 50));