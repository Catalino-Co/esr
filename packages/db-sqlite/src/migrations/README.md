# SQLite migrations

ESR Pro uses versioned SQLite migrations through `runner.cjs`.

Rules:

- Add new migrations under `versioned/` using the format `0003_short_name.cjs`.
- Export `version`, `name`, and an async `up(context)` function.
- Keep migrations idempotent when possible.
- Use runner helpers such as `addColumnIfMissing` and `createIndexIfMissing`.
- Do not edit applied migrations after release; add a new migration instead.

`0001_initial_schema` wraps the legacy `initial-schema.cjs` as the baseline so existing databases keep working during the migration to formal versioning.
