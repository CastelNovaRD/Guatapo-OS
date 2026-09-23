-- Incremental alignment for the ShopDesk catalog and customer model.
-- Review and execute manually after backup; this file is not executed by the app.

alter table customers add column if not exists document_type text;
alter table customers add column if not exists updated_at timestamptz not null default now();
alter table customers add constraint customers_document_type_check check (document_type is null or document_type in ('cedula', 'rnc')) not valid;
create index if not exists customers_tenant_document_idx on customers(organization_id, installation_id, store_id, document);

alter table product_types add column if not exists value text;
alter table product_types add column if not exists label text;
update product_types set value = coalesce(value, name), label = coalesce(label, name) where value is null or label is null;
alter table product_types alter column value set not null;
alter table product_types alter column label set not null;
create unique index if not exists product_types_tenant_value_idx on product_types(organization_id, installation_id, store_id, value);

alter table products add column if not exists stock_min numeric(14,3) not null default 0;
alter table products add column if not exists show_on_website boolean not null default false;
alter table products add column if not exists featured boolean not null default false;
alter table products add column if not exists short_description text;
alter table products add column if not exists slug text;
alter table products add column if not exists full_description text;
alter table products add column if not exists web_visibility text;
create unique index if not exists products_tenant_slug_idx on products(organization_id, installation_id, store_id, slug) where slug is not null;
create index if not exists products_catalog_filters_idx on products(organization_id, installation_id, store_id, active, category_id, product_type_id);

alter table inventory_movements add column if not exists previous_stock numeric(14,3);
alter table inventory_movements add column if not exists new_stock numeric(14,3);
alter table inventory_movements add column if not exists notes text;
alter table inventory_movements add column if not exists movement_type text;
update inventory_movements set movement_type = type where movement_type is null;
create index if not exists inventory_movements_catalog_idx on inventory_movements(organization_id, installation_id, store_id, product_id, created_at desc);

create unique index if not exists product_images_primary_per_product_idx on product_images(product_id) where is_primary;
