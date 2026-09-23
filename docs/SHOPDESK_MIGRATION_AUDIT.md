# ShopDesk OS: audit and migration boundary

## Scope of this first phase

ShopDesk OS is being separated from Guatapo OS and Supabase. No production system,
VPS, or production database is part of this repository migration.

## Current dependency boundary

The application currently has a browser-side Supabase client in `lib/supabase.ts`.
It is imported by interactive pages and shared UI, including `AppShell` and
`store-context`. This means UI, authentication, authorization, and operational
data access are currently coupled to Supabase.

The next phase must replace this per module, not by reintroducing Supabase
credentials or a temporary mock backend.

## Target request path

```
Client UI -> ShopDesk API route / backend -> application service -> repository -> PostgreSQL
```

The UI obtains a session from CastelNova Identity/Auth and sends its signed token
to the ShopDesk API. The API validates the token and builds an immutable request
scope with `userId`, `organizationId`, `installationId`, `role`, and
`permissions`. Repositories receive that scope and apply it to every query.

## Tenant model

`organization_id` identifies the customer tenant and `installation_id` identifies
the deployed ShopDesk instance. `store_id` remains the operational business unit
inside the installation. New operational tables should retain `store_id` and add
`organization_id` and `installation_id`; database constraints and composite
indexes must enforce that the three identifiers belong together. Tenant scope must
be derived from the validated server-side session, never from browser filters.

## Authentication boundary

ShopDesk must not store passwords. Replace direct uses of `supabase.auth` with an
`AuthSession` adapter that exposes only the normalized session identity and an
authorization check. The adapter will later validate the CastelNova signed token.

## Migration sequence

1. Introduce server-only database and identity adapters, plus typed request scope.
2. Move store/session resolution to the API boundary.
3. Migrate one coherent commercial module at a time (starting with catalog and
   customers), replacing its client queries with ShopDesk API calls.
4. Move transactional flows (sales, purchases, cash, credit notes) into services
   with PostgreSQL transactions and idempotency protection.
5. Remove the Supabase client and package only after no caller remains.

## Transactional service candidates

* `receive_purchase`: receive purchase items, update stock, and write inventory
  movements atomically.
* `process_credit_note`: issue the credit note, restore/damage stock, update sale
  balances and payments, and write movements atomically.
* `restore_damaged_inventory`: move damaged stock back to available inventory and
  record its movement atomically.
* `get_inventory_summary` and `get_pos_featured_products`: read models behind
  typed catalog/inventory queries.
* `current_store_ids`: session/store membership resolution from the validated
  request scope, not a database RPC callable by the browser.

## Fiscal data to preserve

Keep fiscal snapshots and sequences independent from customer changes: NCF/e-CF
number, receipt type/status, customer tax snapshot, XML/security code/QR metadata,
credit notes, payment links, and print formats. Sequence allocation must be inside
a transaction and scoped at least to installation/store and fiscal receipt type.

## Explicit exclusions

Raffles, cooperative POS, cooperative commissions, and all related fields,
routes, components, calculations, reports, and data structures do not belong
to ShopDesk OS.

Any remaining references inherited from Guatapo OS must be removed during
the cleanup phase before the Supabase-to-PostgreSQL migration is considered
complete.