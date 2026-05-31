# ESR Pro

ESR Pro is the current desktop/offline version of ESR, built with SvelteKit, Electron and SQLite. The project is being prepared to evolve into a monorepo with a shared business core and two product surfaces:

```text
ESR Core
  -> ESR Pro Desktop   (SQLite + Electron)
  -> ESR Cloud Web     (PostgreSQL + Browser)
```

## Current Status

The working ESR Pro app still lives at the repository root. This is intentional during the first migration phases so the desktop app keeps running while shared packages are introduced gradually.

Current runtime entry points:

- SvelteKit app: `src/`
- Electron app shell: `electron/`
- SQLite schema and seed data: `electron/db/`
- Reusable Svelte components: `src/lib/components/`
- Formatting and PDF generation utilities: `src/lib/utils/`

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

Run ESR Pro in development:

```sh
npm run dev
```

Build the SvelteKit app:

```sh
npm run build
```

Build the Electron package:

```sh
npm run build:electron
```

## Notes

The monorepo folders exist as migration targets only. The app has not yet been moved into `apps/desktop`, and package imports have not yet been rewired.
