# ESR

ESR es un monorepo para operar inventario, eventos, alquileres, cotizaciones, conduces, contratos y reportes del flujo Events Stock & Rentals.

El objetivo es mantener un nucleo compartido y dos superficies de producto:

```text
ESR Core
  -> ESR Pro Desktop   (Electron + SQLite + uso offline)
  -> ESR Cloud Web     (SvelteKit + PostgreSQL + navegador + multiusuario)
```

ESR Pro es la aplicacion desktop/offline actual. ESR Cloud es la base web preparada para una version futura multiusuario con roles, API/backend y backups centralizados. No son dos productos aislados: comparten schemas, reglas de negocio, UI reutilizable, reportes y contratos de repositorios.

## Estructura

```text
esr/
├── apps/
│   ├── desktop/       # ESR Pro: SvelteKit + Electron
│   └── cloud/         # ESR Cloud: SvelteKit web
│
├── packages/
│   ├── core/          # Casos de uso, reglas de negocio e interfaces
│   ├── ui/            # Componentes Svelte compartidos
│   ├── schemas/       # Tipos, schemas y validaciones compartidas
│   ├── db-sqlite/     # Persistencia SQLite para ESR Pro
│   ├── db-postgres/   # Persistencia PostgreSQL para ESR Cloud
│   ├── reports/       # PDFs, cotizaciones, conduces, reportes y formatters
│   └── config/        # Configuracion compartida
│
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Comandos

Instalar dependencias:

```sh
pnpm install
```

ESR Pro:

```sh
pnpm dev:desktop
pnpm build:desktop
pnpm build:electron
```

ESR Cloud:

```sh
pnpm dev:cloud
pnpm build:cloud
```

Workspace:

```sh
pnpm check
pnpm lint
```

## Correr ESR Pro

ESR Pro vive en `apps/desktop`.

```sh
pnpm dev:desktop
```

Este comando levanta Vite para SvelteKit y Electron para la app desktop. La persistencia local se ensambla desde `packages/db-sqlite`; la app desktop no debe crecer con nueva logica SQLite directa si ya existe un repositorio o caso de uso compartido.

## Correr ESR Cloud

ESR Cloud vive en `apps/cloud`.

```sh
pnpm dev:cloud
```

La app Cloud ya compila como SvelteKit web y depende de `@esr/core`, `@esr/ui`, `@esr/schemas`, `@esr/config` y `@esr/db-postgres`. PostgreSQL esta preparado pero no conectado a una funcionalidad real todavia. La variable esperada para el futuro es:

```sh
DATABASE_URL=postgres://user:password@localhost:5432/esr_cloud
```

## Reglas de Arquitectura

- La logica de negocio vive en `packages/core`.
- Las validaciones compartidas viven en `packages/schemas`.
- SQLite vive en `packages/db-sqlite`.
- PostgreSQL vive en `packages/db-postgres`.
- Componentes compartidos viven en `packages/ui`.
- Reportes compartidos viven en `packages/reports`.
- `apps/desktop` ensambla ESR Pro.
- `apps/cloud` ensambla ESR Cloud.

## Nueva Logica de Negocio

Cuando una regla aplique a ESR Pro y ESR Cloud, debe entrar en `packages/core`.

Ejemplos:

- Calcular totales de cotizacion.
- Validar disponibilidad.
- Confirmar una reserva.
- Calcular stock disponible o comprometido.
- Validar conflictos de fechas.

Los casos de uso de `core` deben ser puros o casi puros. Pueden depender de `packages/schemas`, pero no deben importar Electron, SQLite, PostgreSQL, `window`, APIs del navegador ni APIs del sistema operativo.

## Repositorios SQLite

Los repositorios SQLite viven en `packages/db-sqlite/src/repositories`.

Para agregar uno:

1. Define primero la interfaz en `packages/core`.
2. Implementa la clase SQLite en `packages/db-sqlite`.
3. Usa SQL y helpers propios del paquete SQLite.
4. Exporta la implementacion desde `packages/db-sqlite/src/index.cjs`.
5. Consume el repositorio desde `apps/desktop` o desde el adaptador Electron.

SQLite debe encargarse solo de persistencia local, migraciones, seed, queries y backups locales. No debe contener reglas de negocio duplicadas.

## Repositorios PostgreSQL

Los repositorios PostgreSQL viven en `packages/db-postgres/src/repositories`.

Para agregar uno:

1. Define primero la interfaz en `packages/core`.
2. Implementa la clase PostgreSQL en `packages/db-postgres`.
3. Usa `DATABASE_URL` y el pool de `packages/db-postgres/src/connection.ts`.
4. Agrega o ajusta migraciones en `packages/db-postgres/src/migrations`.
5. Exporta la implementacion desde `packages/db-postgres/src/index.ts`.
6. Consume el repositorio desde `apps/cloud` cuando la funcionalidad Cloud exista.

PostgreSQL debe encargarse solo de persistencia web/multiusuario. Las reglas de negocio siguen en `core`.

## Checklist Para Nueva Funcionalidad

1. Definir schema en `packages/schemas`.
2. Definir caso de uso en `packages/core`.
3. Definir interfaces de repositorio en `packages/core`.
4. Implementar SQLite en `packages/db-sqlite`.
5. Implementar PostgreSQL en `packages/db-postgres` si aplica.
6. Crear o reutilizar UI en `packages/ui`.
7. Integrar en `apps/desktop`.
8. Integrar en `apps/cloud` cuando corresponda.
9. Probar ambos entornos.

## Cosas Que NO Deben Hacerse

- No duplicar logica de negocio entre Desktop y Cloud.
- No importar SQLite desde `packages/core`.
- No importar PostgreSQL desde `packages/core`.
- No importar Electron desde paquetes compartidos.
- No poner queries SQL dentro de componentes Svelte si ya existe un repositorio.
- No mover codigo acoplado a desktop hacia `packages/ui`.
- No guardar archivos locales desde `packages/reports`; cada app decide si descarga, guarda o muestra preview.
- No mezclar validaciones estructurales con reglas de negocio complejas en `packages/schemas`.
- No romper ESR Pro durante la migracion.

## Estado Actual

- ESR Pro funciona desde `apps/desktop`.
- ESR Cloud tiene esqueleto SvelteKit en `apps/cloud`.
- `packages/core` contiene reglas e interfaces iniciales.
- `packages/schemas` contiene tipos y validaciones compartidas.
- `packages/db-sqlite` contiene persistencia SQLite de ESR Pro.
- `packages/db-postgres` contiene pool, migracion inicial y repositorios base para Cloud.
- `packages/ui` contiene componentes Svelte reutilizables.
- `packages/reports` contiene generacion PDF, reportes base y formatters.
