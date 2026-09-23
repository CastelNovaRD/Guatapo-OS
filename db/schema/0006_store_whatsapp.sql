-- Commercial WhatsApp contact used by ShopDesk's public catalog.
-- Additive only: existing stores may keep this field null until configured.
alter table stores
  add column if not exists whatsapp text;

comment on column stores.whatsapp is
  'Commercial WhatsApp number shown by the public ShopDesk catalog when configured.';
