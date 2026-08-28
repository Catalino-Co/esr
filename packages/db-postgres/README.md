# @esr/db-postgres

PostgreSQL persistence adapter for ESR Cloud. It owns connection handling, migrations, seeds and repository SQL; business rules remain in `@esr/core`.

## Requirements

- PostgreSQL with permission to create tables and the `pgcrypto` extension.
- `DATABASE_URL` available in the shell running the command.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/cco_apps
PGSCHEMA=esr_cloud
PGSSL=false
PGPOOL_MAX=10
```

Copy values from `.env.example` at the **monorepo root** (`ESR-APP/.env`) into your local `.env`. The scripts intentionally fail before opening a connection when `DATABASE_URL` is missing.

PowerShell (alternativa temporal, solo esa ventana):

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/cco_apps'
$env:PGSCHEMA='esr_cloud'
```

## Database and schema

ESR Cloud uses the shared PostgreSQL database **`cco_apps`**. All application tables live in the schema **`esr_cloud`** (configurable via `PGSCHEMA`). The connection pool and migrator set `search_path` to that schema automatically; repository SQL does not need schema prefixes.

## Commands

From the monorepo root:

```sh
pnpm db:postgres:migrate
pnpm db:postgres:seed
pnpm db:postgres:test
```

Recommended local flow:

1. Create an empty PostgreSQL database named `cco_apps` (or use an existing shared CCO database).
2. Configure `DATABASE_URL` pointing to `cco_apps` and optionally `PGSCHEMA=esr_cloud`.
3. Run `pnpm db:postgres:migrate` (creates schema `esr_cloud` if missing).
4. Run `pnpm db:postgres:seed`.
5. Run `pnpm db:postgres:test`.
6. Start Cloud with `pnpm dev:cloud`.

## Migrator

The runner reads numbered `.sql` files from `src/migrations` in lexical order. It creates the application schema (`esr_cloud` by default), then `schema_migrations` inside it, stores a SHA-256 checksum, skips migrations already applied, and rejects an applied file whose contents changed. Every pending migration runs in its own transaction under a PostgreSQL advisory lock.

Current migrations:

1. `001_initial_schema.sql`
2. `002_multi_company_model.sql`
3. `003_auth_session_model.sql`
4. `004_quotes_and_work_orders.sql`
5. `005_operations_delivery_returns.sql`

`004` adds quote/order numbering, tax fields, line totals and reservation date columns for the commercial flow.

`005` adds operational fields for deliveries and returns: `delivered_quantity` / `returned_quantity` on work order items, conduce numbering (`CON-` / `DEV-`), and indexes for conduces, checklists and stock movements.

`002` creates `companies` and `company_members`, upgrades Cloud users to `password_hash`, and makes `company_id` mandatory on operational tables. Previous prototype rows are assigned to `Legacy Company` so business data is retained. Prototype passwords are not copied and those accounts require a future reset.

## Development seed

`src/seed.ts` idempotently creates Demo Company A and B, one global user and owner membership for each, plus one customer, category, inventory item and event per company. Demo users use a bcrypt hash of `admin123` (development only).

## Integration test

`src/integration-test.ts` uses the actual PostgreSQL repositories to verify customers, inventory, events, quotes, work orders and the operational flow (prepare → deliver → return → close). It checks list visibility and cross-company `findById` access in both directions. Run migrations and seed first.

The lightweight command below remains useful as a fast static guard:

```sh
pnpm --filter @esr/db-postgres check:tenant
```

Authentication, sessions and active-company resolution are implemented in `apps/cloud` (cookie `esr_cloud_session`, table `user_sessions`).
