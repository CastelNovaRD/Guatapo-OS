-- Storefront visual configuration consumed by lib/web-settings.ts.
-- Additive and safe for stores created before the storefront configuration existed.
alter table stores
  add column if not exists web_settings jsonb not null default '{}'::jsonb;

comment on column stores.web_settings is
  'ShopDesk storefront visual settings. Values are normalized by lib/web-settings.ts.';
