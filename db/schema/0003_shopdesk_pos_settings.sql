-- ShopDesk OS - POS settings compatibility

alter table payment_methods
  add column if not exists fee_percent numeric(8,4) not null default 0;

alter table stores
  add column if not exists pos_featured_products_limit integer not null default 10;

alter table stores
  add constraint stores_pos_featured_products_limit_check
  check (pos_featured_products_limit in (5, 10, 20, 50));
