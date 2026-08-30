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

ESR Cloud corre en el puerto **5178**. La app Cloud ya compila como SvelteKit web y depende de `@esr/core`, `@esr/ui`, `@esr/schemas`, `@esr/config` y `@esr/db-postgres`. PostgreSQL debe estar configurado con `DATABASE_URL` para login y sesiones.

```sh
DATABASE_URL=postgres://user:password@localhost:5432/cco_apps
PGSCHEMA=esr_cloud
NODE_ENV=development
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
- `packages/db-postgres` contiene pool, migraciones, sesiones de usuario y repositorios base para Cloud.
- `packages/core/src/authorization` contiene la matriz de permisos por rol de ESR Cloud.
- `packages/ui` contiene componentes Svelte reutilizables.
- `packages/reports` contiene generacion PDF, reportes base y formatters.

## Modelo Multiempresa de ESR Cloud

ESR Cloud aisla la informacion operativa mediante `company_id`:

- `users` representa identidades globales y almacena `password_hash`, nunca contrasenas planas.
- `companies` representa las empresas o tenants.
- `company_members` relaciona usuarios con empresas y contiene el rol dentro de cada empresa.
- Un usuario puede pertenecer a varias empresas.
- Las tablas operativas PostgreSQL tienen un `company_id` obligatorio.

Los contratos `Tenant*Repository` de `packages/core` requieren un `RepositoryContext` con `companyId`. Los contratos existentes sin contexto se conservan para ESR Pro y su persistencia local SQLite; no deben utilizarse desde ESR Cloud.

### Reglas de aislamiento

1. Ningun repositorio operativo de Cloud puede consultar o modificar datos sin `companyId`.
2. `apps/cloud` debe resolver la empresa activa antes de ejecutar acciones de negocio.
3. La empresa activa nunca debe aceptarse ciegamente desde un formulario; debe validarse contra la sesion y `company_members`.
4. PostgreSQL Cloud no debe guardar contrasenas planas.
5. `company_members` define el rol del usuario dentro de una empresa.
6. Las tablas globales deben ser excepciones explicitas.
7. Las consultas entre tablas deben aplicar el mismo `company_id` a todas las relaciones.

La primera barrera de aislamiento vive en los contratos y repositorios. Una fase posterior debe agregar pruebas de integracion y evaluar Row Level Security o claves foraneas compuestas como defensa adicional en PostgreSQL.

## Flujo PostgreSQL Local

ESR Cloud incluye un migrator PostgreSQL con checksums y pruebas de aislamiento multiempresa.

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/cco_apps'
$env:PGSCHEMA='esr_cloud'
pnpm db:postgres:migrate
pnpm db:postgres:seed
pnpm db:postgres:test
pnpm dev:cloud
```

Las migraciones se registran en `esr_cloud.schema_migrations`. Base de datos: **`cco_apps`**, schema de aplicación: **`esr_cloud`**. No se debe editar una migracion ya aplicada; cualquier cambio posterior debe agregarse como un nuevo archivo numerado. El seed crea dos empresas demo y la prueba confirma que clientes, inventario y eventos no son visibles desde otra empresa.

## Autenticacion ESR Cloud

Flujo implementado:

1. El usuario envia email y contrasena en `/login`.
2. El servidor valida `password_hash` con bcrypt (nunca se guarda contrasena en texto plano).
3. Se crea un registro en `user_sessions` con `token_hash` (SHA-256 del token).
4. La cookie HTTP-only `esr_cloud_session` contiene solo el token plano.
5. `hooks.server.ts` valida la sesion y resuelve `locals.user`, `locals.company`, `locals.role` y `locals.companyId`.
6. Las rutas bajo `(app)/` exigen usuario y empresa activa via `+layout.server.ts`.
7. Si el usuario pertenece a varias empresas, debe elegir en `/select-company` (validado en servidor).

Credenciales demo (solo desarrollo local, creadas por el seed):

```text
admin-a@demo.local / admin123  -> Demo Company A
admin-b@demo.local / admin123  -> Demo Company B
```

Helpers server-side para futuras rutas: `requireUser`, `requireCompany`, `requireMembership`, `requireRole` en `apps/cloud/src/lib/server/require-auth.ts`.

## Flujo operativo ESR Cloud (Fase 4–6)

Tras login y empresa activa:

```text
/dashboard
/customers
/inventory
/events
/quotes
/work-orders
/conduces
/incidents
/settings
```

Flujo comercial:

```text
Cliente → Evento → Cotización → Artículos → Aprobación → Orden de trabajo
```

Flujo operativo (Fase 6):

```text
Orden confirmada → Preparación → Conduce de entrega → Entrega → Checklist salida
→ Devolución → Checklist retorno → Incidencias (si aplica) → Cierre de orden
```

Rutas operativas desde el detalle de orden:

```text
/work-orders/[id]
/work-orders/[id]/delivery
/work-orders/[id]/return
/work-orders/[id]/checklists
/work-orders/[id]/incidents
```

Estados de orden (español): `confirmado`, `en_preparacion`, `entregado`, `parcialmente_devuelto`, `devuelto`, `cerrado`, `cancelado`.

Numeración de conduces por empresa: `CON-000001` (entrega), `DEV-000001` (devolución).

Convención de tablas: `quotations` / `quotation_items`, `work_orders` / `work_order_items`, `conduces` / `conduce_items`, `work_order_checklists`, `incidents`, `stock_movements`.

Numeración comercial MVP por empresa: `COT-000001`, `ORD-000001` (último número + 1; no apto para alta concurrencia sin endurecer).

### Fase 7 — Reportes, documentos imprimibles y auditoría

Documentos imprimibles (HTML + `window.print()`):

```text
/quotes/[id]/print
/work-orders/[id]/print
/conduces/[id]/print
/work-orders/[id]/checklists/print?type=salida|retorno
/incidents/[id]/print
```

Los documentos se generan con `@esr/reports/documents` y muestran datos de empresa desde `companies` + `company_info`. El navegador puede imprimir o guardar como PDF.

Reportes operativos básicos:

```text
/reports
/reports/inventory
/reports/orders
/reports/incidents
```

Exportación CSV opcional:

```text
/reports/inventory.csv
/reports/orders.csv
/reports/incidents.csv
```

Auditoría (solo lectura):

```text
/audit
```

ESR Cloud registra acciones críticas en `audit_logs`. Cada entrada incluye `company_id`, usuario, acción, entidad y metadatos no sensibles. Los logs se filtran por empresa; no se pueden editar ni eliminar desde la UI.

Acciones auditadas incluyen: clientes, inventario, eventos, cotizaciones, órdenes, conduces, incidencias, impresión de documentos y consulta de reportes.

Reglas de seguridad:

- `companyId` viene desde `locals` (nunca desde formularios).
- Todas las órdenes, conduces, checklists e incidencias filtran por `company_id`.
- Entregas, devoluciones y cierre de orden se ejecutan en transacción PostgreSQL.

### Fase 8c - Contratos y pagos

```text
/contracts              listado con estado y saldo por contrato
/contracts/new?quoteId= alta desde una cotizacion aprobada
/contracts/[id]         detalle, estado de cuenta y pagos
/contracts/[id]/print   contrato imprimible con pie de firmas
```

**El dinero vive en la cotizacion.** Ni `work_orders` ni `contracts` guardan un
total propio: el monto acordado es `quotations.total`. El contrato formaliza ese
acuerdo y los pagos lo van reduciendo. Las reglas son puras y viven en
`packages/core/src/payments/use-cases.ts`.

Reglas de negocio:

- **El contrato es opcional.** Se genera desde una cotizacion aprobada o ya
  convertida, cuando se quiera. Convertir una cotizacion en orden no lo exige.
- **Un pago cuelga del contrato si existe y, si no, de la cotizacion.** Asi se
  puede cobrar un anticipo antes de firmar sin perder la trazabilidad. El estado
  de cuenta suma siempre los dos origenes sobre el total de la cotizacion.
- **Solo un pago en estado `pagado` reduce el saldo.** Los `pendiente` se
  muestran aparte y los `anulado` no cuentan.
- **Los pagos no se borran: se anulan.** La fila permanece —tachada en pantalla,
  fuera del documento imprimible— para dejar rastro de que existio. Un pago
  anulado no se reactiva: si el cobro se rehace, se registra uno nuevo.
- **Un sobrepago no deja el saldo en negativo.** Se reporta aparte con un aviso.
- Cancelar un contrato con dinero ya cobrado no se bloquea, pero avisa del
  importe por si procede una devolucion.

Permisos:

| Accion | operador | gerente |
| --- | --- | --- |
| Ver contratos e imprimir | si | si |
| Crear y editar contrato | si | si |
| Registrar pago | si | si |
| Firmar o cancelar contrato | no | si |
| Anular pago | no | si |

Registrar un cobro es operacion diaria; anularlo mueve dinero ya registrado y se
reserva a gerencia.

#### Migracion 008

Las tablas `contracts` y `payments` existian desde la migracion 002 pero nunca
se usaron: no tenian indices ni restricciones. La 008 anade el numero de
contrato unico por empresa (`CTR-000001`), un unico contrato vigente por
cotizacion —los cancelados no cuentan, para poder rehacer uno anulado por
error—, los indices de lectura, y dos CHECK que la aplicacion ya validaba pero
la base no: importe de pago mayor que cero y estados cerrados.

### Fase 8d - Paquetes y seriales

**Paquetes** (`/packages`) agrupan articulos que se alquilan juntos. Su razon de
ser es el boton **Insertar paquete** de la cotizacion: explota el paquete en
lineas sueltas, cada una con el **precio vigente** del articulo, no con el
`suggested_price`. Asi un cambio de tarifa no queda congelado en un paquete
definido hace meses. Una vez insertadas, las lineas se editan como cualquier
otra. Si un articulo ya esta en el paquete, se suma la cantidad en vez de
duplicar la linea (`mergePackageItem` en core).

**Seriales** identifican unidades fisicas concretas. Un articulo se marca como
serializado desde su ficha (`item_type`), y entonces:

- Sus existencias dejan de teclearse: `total_quantity` y `available_quantity`
  se derivan de los seriales registrados. El campo pasa a solo lectura.
- Al **entregar**, en vez de un campo numerico se marcan las unidades concretas
  que salen. Pasan a `entregado` y quedan ligadas a la orden.
- Al **devolver** solo se ofrecen las unidades que salieron con esa orden.
  Vuelven a `disponible`.
- `mantenimiento` y `retirado` se marcan a mano desde la ficha y sacan la unidad
  de circulacion sin borrarla.

Ciclo: `disponible -> (entrega) entregado -> (devolucion) disponible`.

Si una unidad vuelve dañada, la incidencia se registra aparte: el serial **no**
pasa a mantenimiento automaticamente, porque eso lo decide quien la revisa.

Permisos: `packages.view/create/update/deactivate`. Los seriales no tienen
permiso propio —son una propiedad del articulo— y se gobiernan con
`inventory.update`; la asignacion en entrega, con `operations.deliver`.

#### Migracion 009

Numero de serie unico por articulo y empresa —normalizado a mayusculas sin
espacios—, nombre de paquete unico por empresa, un articulo una sola vez por
paquete, cantidad de linea mayor que cero y estados de serial cerrados. Ademas
`work_order_item_serials` gana `company_id`, para poder filtrar la asignacion
sin cruzar con `work_orders` en cada consulta.

## Paleta

Los tokens viven en `packages/config/src/theme.css` y los consumen las dos
apps. La fuente unica son los nombres cortos —`--accent`, `--surface`,
`--text-muted`…—; el vocabulario historico de ESR (`--brand-primary`,
`--bg-base`, `--sb-*`, `--primary`…) sigue existiendo como **alias** que
apuntan a ellos, que es lo que permite cambiar la paleta entera sin tocar los
~250 usos repartidos por las dos apps.

**Un alias nunca lleva un literal.** Si un `app.css` escribe
`--danger: var(--brand-danger)` y `theme.css` tiene
`--brand-danger: var(--danger)`, el ciclo deja la propiedad **invalida en
silencio**: no hay error, simplemente no pinta. Le paso a Desktop con
`--success`, `--warning`, `--danger` y `--radius-lg` al adoptar esta paleta.

### Tres reglas

1. **`--text-muted` es el ultimo escalon legible**, no el mas claro. Da 4.8:1
   sobre `--surface` y pasa AA: es el de los encabezados de tabla.
   `--text-placeholder` se queda en 2.6:1 y solo vale para placeholders e
   iconos decorativos.
2. **`--accent` senala una cosa por pantalla**: boton primario, item activo del
   nav, anillo de foco y enlaces. Repartido tambien por badges, iconos y
   bordes deja de senalar nada.
3. **El color puro de un estado no es el color de su letra.** Cada estado son
   tres tokens: `--success` para el punto o el borde, `--success-bg` de fondo y
   `--success-text` encima. `#10b981` como texto sobre blanco no pasa
   contraste.

### El umbral depende del fondo, no del color

Dos consecuencias medidas, no deducidas:

- `--text-muted` (#64748b) da 4.8:1 sobre `--surface` pero **4.47:1 sobre
  `--surface-sunken`**. Lo que va sobre el fondo hundido sube a
  `--text-secondary`.
- En el tema oscuro ese mismo gris cae a **3.07:1** sobre `--surface`. Por eso
  la escala de texto oscura sube un escalon completo respecto a la clara y
  #64748b pasa a ser alli el placeholder. Es la regla 1 aplicada a su propio
  fondo.

La barra lateral es el caso inverso: `--sb-text-item` es #94a3b8, que en claro
seria solo placeholder, pero sobre el indigo oscuro da 5.8:1.

### El acento oscuro pasa por un ojo de aguja

`--accent` en oscuro tiene que cumplir dos cosas a la vez, y tiran en
direcciones contrarias: el boton primario es **letra blanca encima** del acento
(pide 4.5:1) y a la vez una **forma sobre el panel** (pide 3:1 contra
`--surface`). Aclararlo mejora la forma y empeora la letra; oscurecerlo, al
reves:

| Acento oscuro | Letra blanca | Forma sobre el panel |
| --- | --- | --- |
| `#6366f1` | 4.47 ✗ | 3.27 ✓ |
| `#4f46e5` (el del tema claro) | 6.29 ✓ | 2.33 ✗ |
| **`#635bfb`** | **4.75 ✓** | **3.08 ✓** |

La banda que cumple las dos es estrecha —luminancia entre 0.177 y 0.183— pero
existe. `#635bfb` cae dentro y conserva el tono 243 del acento claro, asi que
la identidad no cambia.

### Barra lateral

`--sidebar-bg` y los `--sb-*` viven **fuera** de los bloques de tema: la barra
es siempre oscura. Cualquier color suyo que se tome de un token que si cambia
con el tema se rompe al pasar a oscuro; le paso al avatar, que con
`var(--accent)` bajaba a 4.47:1 en oscuro y ahora usa `--sb-avatar-bg`.

Es `position: sticky; top: 0` con `align-self: flex-start`. Sin eso mide
100vh dentro de un `.app-shell` que crece con el contenido, y en cuanto la
pagina es mas alta que la ventana la barra se queda arriba y debajo asoma el
fondo claro. Desktop no lo notaba porque su `body` lleva `overflow: hidden`.

## Estado de Circulacion y Barras de Filtro

### Estado de circulacion

`is_active` dejo de ser un booleano. Ahora tiene tres valores, los mismos que
ESR Pro Desktop ya usaba en produccion:

| Valor | Estado | Significado |
| --- | --- | --- |
| `1` | Activo | En uso normal. |
| `2` | Inactivo | Pausa reversible. Sigue ofreciendose en los selectores. |
| `0` | Archivado | Retirado de circulacion. Desaparece de todo selector. |

Es un eje **independiente** del estado de negocio: una cotizacion puede estar
`aprobada` y `archivada` a la vez.

La fuente unica es `packages/core/src/shared/record-state.ts`. Los repositorios
filtran con `appendStateFilter()`
(`packages/db-postgres/src/repositories/state-filter.ts`), que acepta un estado
o varios: los listados piden uno y los **selectores** piden
`SELECTABLE_STATES`, porque un inactivo aun puede elegirse y un archivado no.

**Archivar sustituye al borrado, pero no habia ninguno.** Se reviso Cloud,
Desktop y los repositorios: no existe un solo borrado de entidad de negocio
expuesto al usuario. Los `DELETE FROM` que hay son internos (reemplazar las
lineas de una cotizacion, soltar un serial al devolver).

El estado se cambia desde el **detalle** de cada entidad, con
`RecordStateControl.svelte`. Las filas de las listas solo muestran el badge.
Los permisos `*.deactivate` pasaron a llamarse `*.archive`.

#### Migracion 010

Los `is_active = 0` de Cloud significaban "el usuario pulso Desactivar", que
equivale a **inactivo**: se migraron a `2`, dejando el `0` libre con su nuevo
significado. Se anadio un CHECK `is_active IN (0,1,2)` a las 14 tablas, que
hasta entonces aceptaban cualquier entero.

### Barra de filtros

`apps/cloud/src/lib/components/list/FilterBar.svelte` es la unica barra de los
nueve listados. Es **una fila horizontal**: el buscador crece (`flex: 1 1 auto`)
y los selects tienen base fija. El `.filter-bar` anterior daba `width: 100%` a
cada control sin `flex-basis`, asi que todos pedian el ancho entero y luego
encogian segun su contenido.

**Filtra en vivo**, con debounce de 300 ms; no hay boton de buscar. La
navegacion usa `goto(url, { keepFocus: true, replaceState: true })`:
`keepFocus` es imprescindible o el cursor sale del input en cada tecla. El
`<form method="GET">` envolvente y un submit oculto mantienen el filtrado sin
JavaScript.

`StatusSelect.svelte` es un `<select>` nativo con `appearance: none`, punto de
color y chevron propio: conserva teclado, lector de pantalla y el desplegable
del sistema, que en movil supera a cualquier imitacion.

Donde ya habia estado de negocio (cotizaciones, ordenes, contratos, conduces) la
barra lleva **dos selects**. Inventario gano el de categoria, que el repositorio
ya soportaba pero la pantalla no ofrecia; conduces gano busqueda y tipo, que
exigieron ampliar `ConduceListFilters`.

**No hay vista «Todos»**: la lista siempre muestra un estado concreto y la
busqueda respeta el seleccionado.

## Sistema de Diseno

Las tres apps de CCO comparten el mismo lenguaje visual, portado desde CCO
Workshop. Los tokens y el vocabulario de componentes viven en un solo sitio:

```text
packages/config/src/theme.css   -> tokens, temas, componentes y la barra lateral
packages/ui/src/icons.ts        -> mapa de iconos compartido
```

Ambas apps lo importan **antes** de su propio `app.css`:

```js
import '@esr/config/theme.css';
import '../app.css';
```

### Capas de cascada

`theme.css` esta enteramente dentro de `@layer`; el `app.css` de cada app y los
`<style>` de los componentes van sin capa. Lo no-capado gana siempre sobre lo
capado, sin importar especificidad ni orden:

```text
<style> de componente   (sin capa, +1 clase)   -> gana
app.css de cada app     (sin capa)
theme.css               (en capa)              -> pierde
```

Consecuencia practica: para que una regla compartida tenga efecto hay que
**borrar** la definicion equivalente del `app.css`, no basta con el orden de
import. Y una utilidad compartida no puede pisar una regla de `app.css`: se
borra la regla, no se usa `!important` (que invierte el orden de capas).

**La barra lateral es la excepcion: va fuera de capa.** Su ancho colapsado es
comportamiento, no vocabulario tematizable, y ninguna app deberia poder pisarlo
por accidente. Ademas define su propia paleta oscura (`--sb-*`), de modo que se
ve igual en tema claro y oscuro, igual que en Workshop.

### Tokens

Claro es el default de `:root`; oscuro se activa con `[data-theme='dark']` en
`<html>`. Workshop lo hace al reves y por eso parpadea antes de hidratar.

Nombres canonicos y sus alias:

| Canonico | Alias que resuelven a el |
| --- | --- |
| `--sidebar-collapsed-width` | `--sidebar-collapsed`, `--sidebar-width-collapsed` |
| `--brand-primary` | `--primary` |
| `--bg-surface` | `--panel-bg`, `--surface` |
| `--border` | `--border-color` |
| `--text-primary` | `--text-main` |

Los alias **nunca** llevan un literal: se resuelven a traves del canonico para
que un override (por ejemplo el de densidad de Desktop) se propague solo.

Cuidado con los nombres que existen en `theme.css` y tambien en un `app.css`
(`--text-muted`, `--shadow-sm`, `--shadow-md`): ahi no se puede aliasar, porque
`--x: var(--x)` es una referencia ciclica que deja la propiedad invalida en
silencio. Esos se borran del `app.css` y los aporta solo `theme.css`.

El espaciado `--sp-*` esta en rem. Desktop escala `html { font-size }` con su
selector de densidad, asi que el padding de los componentes escala solo y los
bloques `html[data-ui-size]` no tienen que redefinir ni un `--sp-*`.

### Temas

```text
apps/*/src/app.html                        -> script inline anti-parpadeo
apps/cloud/src/lib/stores/theme.ts         -> store de Cloud
apps/desktop/src/lib/stores/theme.js       -> store de Desktop
apps/cloud/src/routes/(app)/settings/appearance   -> selector en Cloud
apps/desktop/src/routes/settings                  -> selector en Desktop
```

El script inline de `app.html` aplica `data-theme` antes del primer paint y
debe seguir siendo **sincrono** (nada de `defer` ni `type="module"`). La
plantilla ya trae `data-theme="light"`, asi que si el script falla queda el
claro y no un documento sin tema. En Desktop el mismo script aplica tambien la
densidad; sus umbrales estan duplicados en `getAppearanceScale()` de
`apps/desktop/src/routes/+layout.svelte` y deben cambiarse en ambos sitios.

En Cloud el servidor siempre renderiza el tema claro, porque no conoce
`localStorage`. Por eso **no se debe ramificar la estructura del marcado sobre
`$theme` en SSR**: produce un desajuste de hidratacion. Para marcar el activo se
espera a `onMount` (ver la pagina de Apariencia).

Las vistas de impresion fijan su pareja fondo/texto en claro: el documento va en
un iframe aislado, pero el cromo alrededor heredaba el texto del tema oscuro
sobre un fondo claro y quedaba ilegible.

### Iconos

Un solo set emoji para las dos apps, en `packages/ui/src/icons.ts`. Para agregar
uno, se anade a `ICONS` y se consume con `import { ICONS } from '@esr/ui/icons'`.
Nunca se escribe el glifo directamente en una pagina: antes cada app —y hasta
cada pagina— redefinia los suyos y se desincronizaban.

### Menu

El menu es **plano, sin titulos de seccion**, y sigue el mismo orden en las dos
apps:

```text
Dashboard, Cotizaciones, Ordenes, Conduces, Eventos, Clientes, Inventario,
Reportes, Auditoria, Incidencias, Configuracion, Documentacion
```

```text
apps/cloud/src/lib/navigation.ts   (filtra por permiso)
apps/desktop/src/lib/navigation.js
```

En Cloud cada entrada declara el permiso minimo que la hace visible; con
`permission: null` la entrada se ve siempre (es el caso del manual). Desktop
suma **Paquetes** junto a Inventario, que en Cloud todavia no existe, y no tiene
Auditoria.

## Manual de Usuario

Cada app sirve su propio manual en `/docs`, portado del de CCO Workshop:

```text
packages/ui/src/docs/markdown.ts     -> Markdown a HTML + extraccion del TOC (compartido)
apps/<app>/src/lib/docs/sections.js  -> indice: grupos, secciones, resumenes e iconos
apps/<app>/src/lib/docs/content/     -> un .md por seccion
apps/<app>/src/routes/.../docs/      -> portada, indice lateral y /docs/[slug]
```

`sections.js` es la **unica fuente de verdad** del esqueleto: de ahi salen el
indice lateral, la portada, las rutas, el TOC de cada pagina y la navegacion
anterior/siguiente.

Para redactar una seccion basta crear `lib/docs/content/<slug>.md`. Mientras no
exista, la pagina muestra el esquema estandar (vista general, acciones, campos,
flujo) y la portada la marca **En redaccion**. En cuanto el archivo existe, sus
encabezados `##` pasan a ser el TOC, asi que el indice nunca queda
desincronizado del texto. Los archivos empiezan en `##`: el titulo ya lo pinta
la pagina desde `sections.js`.

Vite inlina cada `.md` en el bundle, de modo que el manual funciona igual en la
web y en Electron (`file://`) sin pedirle nada al servidor.

En Desktop, que se prerenderiza con `ssr: false`, el rastreador de SvelteKit no
puede descubrir los enlaces del manual. Por eso
`apps/desktop/src/routes/docs/[slug]/+page.js` exporta `entries()` derivado de
`docsSections`: agregar una seccion no obliga a tocar la configuracion.



### Fase 8a - Roles y configuracion de empresa

ESR Cloud aplica una matriz de permisos por rol. El rol vive en
`company_members.role` y se resuelve en `hooks.server.ts`; nunca se acepta desde
un formulario.

| Rol (BD) | Etiqueta | Alcance |
| --- | --- | --- |
| `owner` | Propietario | Igual que admin. No puede degradarse ni desactivarse desde la UI. |
| `admin` | Administrador | Todo, incluye `/settings` y gestion de miembros. |
| `manager` | Gerente | Aprueba, convierte y cancela cotizaciones; cancela y cierra ordenes; resuelve incidencias; desactiva registros; ve auditoria. |
| `staff` | Operador | Crea y edita clientes, eventos, inventario y cotizaciones; prepara, entrega, devuelve y llena checklists; crea incidencias. |
| `viewer` | Lector | Solo lectura y reportes. |

La matriz es pura y vive en `packages/core/src/authorization/permissions.ts`.
Un permiso describe una accion de negocio, no una ruta.

Doble barrera:

1. **Servidor (obligatoria):** `requirePermission(locals, 'quotes.approve')` en
   `apps/cloud/src/lib/server/permissions.ts`. Se evalua en cada `load` y cada
   action; sin permiso responde 403.
2. **UI (cosmetica):** `can('quotes.approve')` en `apps/cloud/src/lib/can.ts`
   oculta botones y entradas de menu. Nunca sustituye a la barrera del servidor.

Rutas de configuracion:

```text
/settings
/settings/company    -> company_info por empresa (encabeza los documentos imprimibles)
/settings/users      -> company_members + users (agregar, editar, activar/desactivar)
/settings/roles      -> matriz de permisos, SOLO LECTURA
```

Reglas de `/settings/users`:

- Solo se agregan cuentas que ya existen en `users`. Agregar un usuario no crea
  identidades ni contrasenas.
- El `owner` no puede modificarse desde la UI.
- La empresa debe conservar al menos un `owner` o `admin` activo, y se comprueba
  contra el estado FINAL: degradar el rol y desactivar son dos formas de
  quedarse sin ninguno.
- Toda alta, edicion y cambio de estado queda en `audit_logs`.

**El nombre y el email no son de la empresa.** Viven en `users`, que es la
identidad global; `company_members` solo guarda `role` y `status`. Editarlos
desde aqui cambia **con que email inicia sesion** esa persona y su nombre en
**todas** las empresas donde sea usuario. El dialogo lo avisa junto a los dos
campos, y el choque con el UNIQUE de `users.email` se devuelve como error de
campo en vez de dejar que salte PostgreSQL.

`/settings/roles` es una referencia: exporta `load` y ninguna action. Su matriz
se arma desde `ROLE_PERMISSIONS`, la misma constante que autoriza de verdad, asi
que no puede desviarse de lo que hace la aplicacion. Las etiquetas en espanol de
los permisos y su agrupacion por modulo viven en `PERMISSION_LABELS` y
`PERMISSION_GROUPS`, pegadas a la matriz para que un permiso nuevo sin etiqueta
lo detecte TypeScript.

`settings.view` lo tienen **todos los roles**: solo habilita abrir la seccion
Configuracion, cuyo contenido base es Apariencia, que es una preferencia
personal del usuario y no configuracion de empresa. Cada subseccion sensible
exige su propio permiso en su `load`.

### Fase 8b - Catalogos de la empresa

Cuatro catalogos bajo Configuracion, todos con `settings.catalogs.manage`, que
tienen `admin` y `gerente` pero no `operador` ni `lector`:

```text
/settings/categories      -> categories + subcategories (arbol de dos niveles)
/settings/event-types     -> event_types
/settings/suppliers       -> suppliers
/settings/collaborators   -> collaborators
```

**Nada se borra: se desactiva.** Los registros historicos (eventos, articulos,
ordenes) apuntan a estas filas por id, asi que un borrado real dejaria huerfanos
o reescribiria el pasado. Al desactivar algo en uso la pantalla avisa cuantos
registros lo referencian, pero no lo impide: el historico conserva su valor.

La logica repetida —validar el nombre, rechazar duplicados, guardar y auditar—
vive una sola vez en `apps/cloud/src/lib/server/catalogs.ts`, y la pantalla
generica en `lib/components/settings/CatalogManager.svelte`, que se configura
declarando `fields` y `columns`. Categorias tiene pagina propia porque las
subcategorias cuelgan de un padre.

#### Unicidad por empresa (migracion 007)

`event_types` venia del modelo de una sola empresa con `name TEXT UNIQUE`. La
migracion 002 le agrego `company_id` pero **nunca toco esa restriccion**, asi
que el UNIQUE seguia siendo global: la segunda empresa que intentara crear
"Boda" chocaba contra el tipo de otra empresa, y de paso revelaba que ese
nombre ya existia en algun sitio. La migracion 007 lo reemplaza por indices
unicos `(company_id, LOWER(TRIM(name)))` en los cuatro catalogos —
`(company_id, category_id, LOWER(TRIM(name)))` en subcategorias.

Normalizar en el indice evita que "Boda" y " boda " convivan en la misma
empresa. Las pantallas ademas consultan antes de escribir para dar un mensaje
claro, pero **la barrera real es el indice**: entre la consulta y el INSERT cabe
una escritura concurrente.

Comandos:

```powershell
$env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/cco_apps'
$env:PGSCHEMA='esr_cloud'
pnpm db:postgres:migrate
pnpm db:postgres:seed
pnpm dev:cloud
pnpm build:cloud
```

Credenciales demo (solo desarrollo local, contrasena `admin123`):

```text
admin-a@demo.local      Demo Company A  owner
gerente-a@demo.local    Demo Company A  manager
operador-a@demo.local   Demo Company A  staff
lector-a@demo.local     Demo Company A  viewer

admin-b@demo.local      Demo Company B  owner
gerente-b@demo.local    Demo Company B  manager
operador-b@demo.local   Demo Company B  staff
lector-b@demo.local     Demo Company B  viewer
```
