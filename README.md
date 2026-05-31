# ESR Pro

ESR Pro is the current desktop/offline version of ESR, built with SvelteKit, Electron and SQLite. The project is being prepared to evolve into a monorepo with a shared business core and two product surfaces:

```text
ESR Core
  -> ESR Pro Desktop   (SQLite + Electron)
  -> ESR Cloud Web     (PostgreSQL + Browser)
```

## Current Status

The working ESR Pro app now lives in `apps/desktop`. Shared packages exist as migration targets and will receive code gradually.

Current runtime entry points:

- SvelteKit app: `apps/desktop/src/`
- Electron app shell: `apps/desktop/electron/`
- SQLite schema and seed data: `apps/desktop/electron/db/`
- Reusable Svelte components: `apps/desktop/src/lib/components/`
- Formatting and PDF generation utilities: `apps/desktop/src/lib/utils/`

## Target Structure

The repository is being prepared for this structure:

```text
esr/
├── apps/
│   ├── desktop/       # Future home of ESR Pro
│   └── cloud/         # Future ESR Cloud web app
│
├── packages/
│   ├── core/          # Shared business rules
│   ├── ui/            # Shared visual components
│   ├── schemas/       # Shared validation schemas and types
│   ├── db-sqlite/     # SQLite data access for ESR Pro
│   ├── db-postgres/   # PostgreSQL data access for ESR Cloud
│   ├── reports/       # PDFs, contracts, quotations and report templates
│   └── config/        # Shared project configuration
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Migration Rules

- Do not break ESR Pro during the migration.
- Move code in small, reversible phases.
- Do not duplicate business logic between ESR Pro and ESR Cloud.
- Move business rules gradually into `packages/core`.
- Isolate SQLite access in `packages/db-sqlite`.
- Prepare PostgreSQL support in `packages/db-postgres` without blocking desktop work.
- Move reusable UI into `packages/ui`.
- Move shared validation contracts into `packages/schemas`.
- Move PDF/report generation into `packages/reports`.

## Development

Install dependencies:

```sh
npm install
```

Run ESR Pro in development from the root:

```sh
pnpm dev:desktop
```

Build the SvelteKit app from the root:

```sh
pnpm build:desktop
```

Build the Electron package:

```sh
pnpm --filter desktop build:electron
```

Workspace commands:

```sh
pnpm dev:desktop
pnpm build:desktop
pnpm dev:cloud
pnpm build:cloud
pnpm lint
pnpm check
```

During this phase, `apps/cloud` and the shared packages are placeholders until their implementation phases begin.

## Notes

The app has been moved into `apps/desktop`, but business logic has not yet been extracted into shared packages.
