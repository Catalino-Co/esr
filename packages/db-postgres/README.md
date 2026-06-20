# @esr/db-postgres

PostgreSQL persistence adapter for ESR Cloud. It owns connection handling, migrations, seeds and repository SQL; business rules remain in `@esr/core`.

## Requirements

- PostgreSQL with permission to create tables and the `pgcrypto` extension.
- `DATABASE_URL` available in the shell running the command.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/esr_cloud_dev
PGSSL=false
PGPOOL_MAX=10
```

Copy values from `.env.example` into your local environment. The scripts intentionally fail before opening a connection when `DATABASE_URL` is missing.

PowerShell example:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/esr_cloud_dev'
```

## Commands

From the monorepo root:

```sh
pnpm db:postgres:migrate
pnpm db:postgres:seed
pnpm db:postgres:test
```

Recommended local flow:

1. Create an empty PostgreSQL database named `esr_cloud_dev`.
2. Configure `DATABASE_URL`.
3. Run `pnpm db:postgres:migrate`.
4. Run `pnpm db:postgres:seed`.
5. Run `pnpm db:postgres:test`.
6. Start Cloud with `pnpm dev:cloud`.

## Migrator

The runner reads numbered `.sql` files from `src/migrations` in lexical order. It creates `schema_migrations`, stores a SHA-256 checksum, skips migrations already applied, and rejects an applied file whose contents changed. Every pending migration runs in its own transaction under a PostgreSQL advisory lock.

Current migrations:

1. `001_initial_schema.sql`
2. `002_multi_company_model.sql`

`002` creates `companies` and `company_members`, upgrades Cloud users to `password_hash`, and makes `company_id` mandatory on operational tables. Previous prototype rows are assigned to `Legacy Company` so business data is retained. Prototype passwords are not copied and those accounts require a future reset.

## Development seed

`src/seed.ts` idempotently creates Demo Company A and B, one global user and owner membership for each, plus one customer, category, inventory item and event per company. The stored password marker is deliberately not an authentication hash.

## Integration test

`src/integration-test.ts` uses the actual PostgreSQL repositories to verify customers, inventory and events. It checks list visibility and cross-company `findById` access in both directions. Run migrations and seed first.

The lightweight command below remains useful as a fast static guard:

```sh
pnpm --filter @esr/db-postgres check:tenant
```

Authentication, sessions and active-company resolution are intentionally deferred to the next ESR Cloud phase.
