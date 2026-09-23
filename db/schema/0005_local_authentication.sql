-- ShopDesk OS local authentication. Review and apply manually; never executed by the app.
alter table app_profiles
  add column if not exists email text,
  add column if not exists password_hash text,
  add column if not exists password_changed_at timestamptz;

create unique index if not exists app_profiles_tenant_email_unique_idx
  on app_profiles (organization_id, installation_id, lower(email))
  where email is not null;

create table if not exists shopdesk_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shopdesk_auth_sessions_active_user_idx
  on shopdesk_auth_sessions (user_id, expires_at)
  where revoked_at is null;
