# @esr/db-postgres

PostgreSQL persistence adapter for ESR Cloud.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string. Example: `postgres://user:password@localhost:5432/esr_cloud`.
- `PGSSL`: Set to `true` to enable SSL with `rejectUnauthorized: false` for hosted PostgreSQL providers.
- `PGPOOL_MAX`: Optional pool size. Defaults to `10`.

This package owns persistence only. Business rules must stay in `@esr/core`.

