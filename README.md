# ESR

ESR es un monorepo para operar inventario, eventos, alquileres, cotizaciones, conduces y reportes del flujo Events Stock & Rentals.

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
/work-orders/new    # orden sin cotizacion
/invoices
/invoices/new
/invoices/[id]
/conduces          # sin entrada de menu: nota de entrega, aparcada
/incidents
/settings
```

Flujo comercial:

```text
Cliente → Evento → Cotización → Artículos → Aprobación → Orden de trabajo
```

Flujo operativo (Fase 6):

```text
Orden confirmada → Preparación → Conduce de entrega → Entrega → Checklist salida → Factura
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

Numeración por empresa: conduces `CON-000001` (entrega) y `DEV-000001` (devolución); facturas `FAC-000001`.

Convención de tablas: `quotations` / `quotation_items`, `work_orders` / `work_order_items`, `conduces` / `conduce_items` / `conduce_item_serials`, `invoices` / `invoice_items` / `invoice_conduces`, `work_order_checklists`, `incidents`, `stock_movements`. La disponibilidad no tiene tabla: se calcula.

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

### Desktop: facturas y cobros

Cloud recibio seis fases seguidas; Desktop, ninguna. Esta tanda cierra el hueco
mas visible —Desktop no tenia forma de cobrar— y arregla un fallo que lo
bloqueaba todo.

**Una instalacion nueva no podia entrar.** El esquema inicial solo inserta
`company_info`, el seed no crea usuarios y `resetAdminUser()` estaba exportada
sin llamadores. La tabla `users` quedaba vacia y el login era infranqueable. En
vez de sembrar un `admin/admin123` —credencial conocida y permanente en una
aplicacion con datos de facturacion— la pantalla de acceso detecta que no hay
nadie y pide **crear el administrador**, revalidando `COUNT(*) = 0` dentro de la
misma transaccion del INSERT. `resetAdminUser()` se borro: hacia UPDATE
incondicional y llamarla habria pisado la contraseña de toda instalacion
existente.

#### Migracion 0003

`invoices`, `invoice_items`, `invoice_conduces` y `payments`. Puramente
aditiva. Decisiones que se apartan de Cloud, y por que:

- **`invoice_seq` aparte de `invoice_number`.** SQLite no tiene regex; extraer el
  numero del texto obligaria a un `substr` posicional que se rompe el dia que el
  numero sea un NCF. Con columna numerica, `MAX(invoice_seq)+1` es trivial.
- **Sin `CHECK`.** En SQLite cambiar un CHECK exige reconstruir la tabla entera,
  y el esquema existente no tiene ninguno. La validacion vive en el repositorio.
- **`REAL` para el dinero.** Todo el esquema lo usa; mezclar centavos enteros
  daria errores de factor 100 en la frontera con `conduce_items`. Se compensa
  redondeando a dos decimales en cada escritura.
- **Sin `conduce_type`.** En Desktop las devoluciones no emiten conduce, asi que
  todas las entregas son facturables. Añadir la columna introduciria el concepto
  que se retiro de Cloud. El unico punto a tocar si eso cambia es la constante
  `BILLABLE_CONDUCE_SQL` del repositorio.
- **Indice unico PARCIAL** `ON invoice_conduces (conduce_id) WHERE is_active = 1`,
  igual que Cloud: un enlace vivo por entrega y N muertos, de modo que anular
  libera sin borrar historia. Va en el ESQUEMA y no en el codigo porque `db:run`
  deja al renderer ejecutar SQL arbitrario; el indice se cumple igual.
  Comprobado contra el sqlite3 que usa Desktop (3.52.0).

#### `withTransaction`: lo que no estaba en el encargo

En `db-postgres` la transaccion viaja en un parametro. En `db-sqlite` no: `db` es
una variable de modulo y `BEGIN`/`COMMIT` operan sobre estado ambiental. Eso
produce dos fallos silenciosos —anidamiento entre repositorios, y dos
invocaciones IPC simultaneas— que con cuatro operaciones transaccionales nuevas
dejan de ser teoricos. `connection.cjs` gana `withTransaction`, que serializa por
cola de promesas.

**Convencion:** un metodo con prefijo `tx` asume transaccion abierta y no hace
BEGIN. Los publicos abren la suya.

Diferencia con Cloud que simplifica el codigo: en PostgreSQL una violacion de
unicidad aborta la transaccion entera y por eso el reintento de numeracion
necesita `SAVEPOINT`. En SQLite el conflicto por defecto es `ABORT`, que deshace
solo la sentencia. **No lo «arregle» copiando Cloud.**

#### Patron de datos

Repositorio + IPC, no SQL crudo en el `.svelte`. Es la excepcion en Desktop —11
de sus 14 repositorios estan muertos porque las pantallas escriben su propio
SQL— y se eligio porque ese camino **no tiene transacciones**, y emitir o anular
una factura con sus cobros exige atomicidad.

`invoices.cjs` devuelve `{ok, data|error}` en vez de lanzar: `ipcRenderer.invoke`
antepone «Error invoking remote method…» al mensaje, y aqui los mensajes de
negocio son la interfaz.

#### Pantallas

`/invoices`, `/invoices/new` (dos fases) y `/invoices/detail?id=`. Query params y
no `[id]` porque Desktop es SPA prerenderizada. **`detail`, no `edit`**: una
factura emitida no se edita.

Se emite desde el modulo eligiendo entregas, con atajos desde el conduce y desde
la orden que apuntan al mismo camino. El campo de descuento se precarga con la
suma de los descuentos de los conduces elegidos: la factura recalcula el subtotal
desde las lineas e ignora el del conduce, y sin precargarlo el usuario ve un
total en el conduce y otro mayor en la factura.

Contra la avalancha de conduces historicos —el dia que se instala el modulo todas
las entregas pasadas aparecen como pendientes— la fase 1 muestra por defecto solo
los ultimos 90 dias.

### Codigo muerto retirado de core

`packages/core/src/conduces/` entero (`use-cases.ts` y `repositories.ts`) y casi
todo `inventory/stock.ts`: `calculateCommittedStock`, `calculateAvailableStock`,
`findInsufficientStock`, `formatInsufficientStockDetail` y sus tres tipos. Con
la disponibilidad calculada en SQL ya no habia nada que pudieran hacer: sumar
compromisos en memoria exige traerse antes todas las filas que la consulta ya
agrega.

De `stock.ts` sobrevive `shouldDeductStockForConduce` con sus dos constantes:
las importan dos pantallas de conduces de ESR Pro Desktop.

Tambien desaparece una duplicacion tonta: `STOCK_DEDUCTING_CONDUCE_STATUSES` y
`CONDUCE_STOCK_DEDUCTING_STATUSES` eran la misma lista con el nombre al reves,
en dos archivos.

#### Cuidado al buscar usos en `@esr/core`

El paquete tiene **exports condicionales**:

```json
"exports": { ".": { "import": "./src/index.ts", "require": "./src/index.cjs" } }
```

`import` resuelve al TypeScript —Cloud, y los `.svelte` de Desktop— y `require`
a `index.cjs`, que es una implementacion CommonJS **aparte**, escrita a mano,
con sus propias copias de estas mismas funciones. Las de `index.cjs` siguen
vivas: las usan `packages/db-sqlite` y los tests de `packages/core/test`.

Un `grep --include=*.ts` no ve ese mundo y da por muerto lo que no lo esta. Aqui
paso: la primera busqueda dijo que estas funciones no tenian ningun uso.

**Poda posterior.** De los 28 simbolos de `index.cjs`, solo 4 tienen consumidor de
produccion: los que requiere `sqlite-inventory.repository.cjs`. Se retiraron 12
—los cinco de conduce, `calculateCommittedStock`, `calculateAvailableStock`,
`calculateQuoteLineTotal`, `calculateQuoteTotals`, `mergeRentalOrderItem`,
`planRentalOrderStatusForSave` y una constante duplicada— y dos dejaron de
exportarse. `calculateQuoteTotals` **no se corrigio, se borro**: divergia del
TypeScript porque ignora el impuesto, pero no tiene ni un llamador ni un test, asi
que arreglarla no habria cambiado nada. El bug real esta en otro sitio: la tabla
`quotations` de SQLite no tiene `tax_amount`, o sea que **Desktop no cotiza ITBIS
en absoluto**.

### Una sola cuenta de disponibilidad

Sobre el mismo articulo convivian TRES numeros y no coincidian. En la base de
demo, un articulo del que existen 5 unidades: la tabla de reservas decia 7
comprometidas, la columna guardada 4 disponibles, y la derivacion 4
comprometidas.

| Fuente | Quien la pintaba | Como se mantenia |
| --- | --- | --- |
| `items.available_quantity` | Listado, reportes, CSV, paquetes | Se tecleaba en la ficha. Ninguna entrega ni devolucion la tocaba. |
| `work_order_stock_reservations` | Ficha del articulo | Se escribia al crear la orden y se soltaba SOLO al cancelarla. |
| Derivacion sobre `work_order_items` | Nada visible | Correcta: era la unica que bloqueaba al crear una orden. |

Se queda la tercera. La migracion **015** borra la tabla y la columna.

**La liberacion deja de existir como paso.** No hay nada que soltar porque no
hay nada apartado: una orden que llega a `devuelto` o `cerrado` sale de
`ACTIVE_INVENTORY_ORDER_STATUSES` y deja de contar sola. La alternativa —
mantener la tabla y añadir la liberacion en entrega, devolucion, cierre y
anulacion de conduce— dejaba dos fuentes que alguien tendria que acordarse de
mover en paso cada vez que se añada una operacion.

La cuenta vive en `packages/db-postgres/src/repositories/availability.ts`, y de
ahi la leen el listado, la ficha, los reportes, el CSV, la pantalla de paquetes
y el `checkAvailability` que bloquea. Antes ese `checkAvailability` estaba en el
repositorio de COTIZACIONES, que es donde nadie lo buscaria; ahora es del
inventario, que es de donde es.

#### Dos cosas que la unificacion destapo

- **Se descontaba dos veces lo devuelto.** La consulta excluia las lineas con
  estado `devuelto` Y ademas restaba `returned_quantity`. Una linea devuelta
  entera ya daba cero por la resta; excluirla por estado hacia desaparecer
  tambien las PARCIALMENTE devueltas, que si retienen lo que falta por volver.
  El gate subestimaba y dejaba comprometer de mas.
- **Las existencias de un articulo serializado se tecleaban.** El seed dejo un
  articulo con `total_quantity = 5` y tres seriales. Ahora el total sale de los
  seriales —descontando retirados y en mantenimiento— y la ficha avisa cuando lo
  comprometido supera lo que hay en circulacion, que antes era invisible porque
  los dos numeros no guardaban relacion.

`shouldReserveStock` y `planRentalOrderStatusForSave` NO se tocan: no los usa
Cloud, pero si Desktop, que lleva su propia reserva sobre SQLite.

### Fase 5 - Copiar una cotizacion

Boton **Copiar** en la ficha de la cotizacion. El dialogo pide cliente y evento,
con los eventos acotados al cliente elegido: el destino puede ser OTRO cliente,
y entonces el evento del original no sirve porque es de otro.

Se copia lo COMERCIAL —lineas con sus fechas, descuento de linea, descuento e
impuesto de cabecera, notas y condiciones—. El ciclo de vida no se hereda
nunca: la copia nace en `borrador`, activa, con numero nuevo, fecha de hoy y sin
`confirmed_at` ni `cancelled_at`. Copiar una cotizacion ya convertida no debe
producir otra que se cree convertida. Por eso el permiso es `quotes.create` y no
`quotes.update`: lo que sale es un documento nuevo.

`valid_until` no se hereda a proposito: arrastrarlo dejaria la copia con una
validez ya vencida.

#### Tres defectos que solo se veian al copiar

Copiar es el unico camino que LEE lineas existentes y las vuelve a escribir, asi
que destapo lo que `replaceItems` hacia mal:

- **No propagaba `start_date` ni `end_date`.** La ventana de alquiler es con la
  que se comprueba disponibilidad y se reserva stock al convertir en orden, de
  modo que la copia salia sin ella y reservaba para siempre. Es el fallo mas
  caro de los tres.
- **Descartaba las lineas de paquete** (`if (item.is_package) continue`), y
  ademas `mapQuoteItem` no devolvia `package_id`, asi que ni siquiera dejando de
  descartarlas se habrian escrito bien. Ningun camino de la UI crea esas lineas
  hoy —`addPackage` explota el paquete en lineas sueltas— pero la columna existe
  y una fila asi se perdia en silencio.
- **`item.item_id || item.id`** caia al id de la FILA cuando no habia articulo,
  escribiendo como `item_id` algo que no es un articulo.

El INSERT pasa de nueve columnas a doce: entran `discount_amount`, `start_date`
y `end_date`.

#### El numero deja de poder repetirse

`nextQuoteNumber` lee el maximo y suma uno, que es una carrera, y
`quotations_company_quote_number_idx` era un indice NORMAL: dos cotizaciones con
el mismo COT- se guardaban en silencio. Copiar multiplica la exposicion porque
invita al doble clic sobre el mismo registro.

La migracion **014** lo cambia por un indice UNICO y `create` reintenta sobre un
`SAVEPOINT` al recibir un 23505, igual que la factura desde la 012. Si ya
hubiera numeros repetidos, la migracion **para y los nombra** en vez de elegir
un ganador a ciegas: un numero de cotizacion es un documento que el cliente ya
vio, y renumerarlo lo decide quien opera.

### Fase 3 - Orden sin cotizacion

`/work-orders/new` crea una orden sin documento comercial detras. El esquema
siempre lo permitio —`work_orders.quotation_id` es nullable y sin indice
unico—, pero no habia por donde.

**El `create()` que existia no servia, y no tenia ni un llamador.** Le faltaban
cinco cosas: no generaba `order_number`, nacia en `pendiente` —un estado sin
ninguna transicion de salida, o sea una orden que no se puede preparar ni
entregar ni cerrar—, no escribia totales, no creaba
`work_order_stock_reservations` y su `replaceItems` insertaba solo `item_id` y
`quantity`, perdiendo precio, total de linea, la ventana de alquiler y el
estado. Se reescribio entero a imagen de `createFromQuote`, y `replaceItems`
pasa de cuatro columnas a nueve.

La orden nace **confirmada** y apartando stock. No hay estado borrador en
`work_orders`, asi que se crea entera de una vez —cabecera y lineas en la misma
pantalla—, al reves que la cotizacion, que nace vacia. Una orden vacia y
confirmada seria una orden que no reserva nada y que no se puede preparar.

`WorkOrderCreationService` es el espejo de `QuoteConversionService`: comprueba
la disponibilidad de cada linea contra la ventana de alquiler ANTES de reservar,
y todo va en una transaccion.

**Nada de lo que llega por el formulario se cree por venir de un `<select>`.**
Cliente, evento y cada articulo se releen contra la empresa activa. Las claves
foraneas no frenan esto porque apuntan a la tabla entera, no a la empresa: sin
la comprobacion, una orden podia acabar apuntando al cliente de otro inquilino.

La ventana de alquiler se pide a nivel de orden y baja a todas las lineas y a
sus reservas. Es con la que `checkAvailability` mide el solape.

Permiso nuevo: `work_orders.create`, desde operador.

### Fase 4 - Anular un conduce

Un conduce se anula en uno de dos modos:

- **Solo el documento** — la entrega ocurrio; lo que se retira es el papel. Las
  cantidades, los seriales y el estado de la orden no se tocan.
- **Deshacer la operacion** — la entrega no ocurrio. Vuelven atras las
  cantidades, el estado de la linea, el estado de la orden, los seriales y las
  incidencias que genero, y se escriben movimientos de stock que compensan los
  suyos. Todo en UNA transaccion.

Los dos modos venian del plan como `comercial` y `error`, de cuando el conduce
era el documento de dinero. La 012 se llevo el dinero a la factura, asi que
`comercial` dejo de describir nada: hoy la distincion util es documento contra
operacion, y la migracion **013** renombra el CHECK.

**Una entrega cubierta por una factura viva no se puede anular.** Primero se
anula la factura, que libera la entrega. Sin esa regla se estaria cobrando algo
que ya no ocurrio.

#### Lo que la migracion 013 tuvo que anadir

Al ir a escribir la reversion salio que tres de los siete efectos eran
**inalcanzables** con el esquema de entonces. El conduce registraba QUE se movio
y CUANTO, pero no CUALES unidades ni CON QUE resultado:

- `conduce_item_serials` — que seriales movio cada conduce.
  `work_order_item_serials` guarda lo mismo indexado por ORDEN, asi que con dos
  entregas parciales no sabe cual movio cual. El backfill solo atribuye los
  casos sin ambiguedad —una unica entrega candidata—; el resto se queda sin
  atribuir a proposito.
- `conduce_items.return_condition` — con que condicion volvio cada linea. El
  estado del articulo se calculaba y se perdia, asi que al anular UNA de varias
  devoluciones no habia con que recalcular el que queda.
- `incidents.conduce_id` — que conduce genero cada incidencia.

Un conduce anterior a la 013 puede no tener estos datos. En ese caso el modo
operacion **se niega** en vez de adivinar, y dice por que.

#### Las otras dos negativas

- Una entrega cuya mercancia ya se devolvio no se deshace: dejaria la linea con
  mas devuelto que entregado. Hay que anular antes la devolucion.
- Una orden `cerrado` o `cancelado` no admite cambios hacia atras.

`stock_movements` es bitacora *append-only*: no se borra nada, se escribe el
movimiento contrario (`reverso_delivered`, `reverso_returned`,
`reverso_damaged`, `reverso_lost`) con la misma cantidad.

Permiso nuevo: `conduces.cancel`, de gerencia para arriba. Anular un conduce
puede deshacer una entrega entera, asi que no es operacion diaria.

### Fase 9.3 - La factura es un documento propio

El conduce nacio como nota de **entrega** y de **devolucion**: se emite uno por
cada entrega parcial y uno por cada devolucion. Eso lo hace un mal documento de
cobro por dos razones que no se arreglan renombrandolo: una devolucion no se
factura, y una misma venta puede repartirse en varias entregas.

Asi que el dinero se muda a **`invoices`**, que cubre **una o varias entregas de
la misma orden**, nunca una devolucion, y es el unico ancla de un pago. El
conduce sigue existiendo tal cual, como nota de entrega: **pierde el menu y el
estado de cuenta**, se llega a el desde la orden y desde la factura, y queda a
la espera de que se retome.

Tres tablas nuevas en la migracion **012**:

- `invoices` — cabecera, numeracion `FAC-000001`, dos estados (`emitida`,
  `anulada`) y el estado de circulacion de tres valores.
- `invoice_items` — las lineas se **copian** de los conduces cubiertos, no se
  leen por join: una factura emitida no puede cambiar porque alguien corrija el
  conduce despues.
- `invoice_conduces` — que entregas cubre. Su indice unico es **parcial**
  (`WHERE is_active = 1`): al anular una factura sus enlaces pasan a 0 y las
  entregas vuelven a estar disponibles. Un UNIQUE a secas las dejaria presas de
  una factura anulada, y borrar la fila perderia el rastro.

`payments.conduce_id` pasa a `invoice_id NOT NULL`. Esta vez **si hay backfill**:
cada conduce de entrega con pagos recibe su factura, con sus mismas lineas y su
mismo total. Solo se descartan los pagos que colgaban de una devolucion, porque
no tienen factura posible; la migracion lo dice por `RAISE NOTICE`.

Anular una factura va en **una sola transaccion**: la factura pasa a `anulada`,
sus cobros vigentes se anulan y sus entregas se liberan. La pantalla informa de
cuantos cobros se anularon, porque eso deshace dinero ya registrado.

`invoices_company_number_unique` existe para frenar la carrera de
`nextInvoiceNumber`, que lee el maximo y suma uno. El servicio reintenta sobre
un `SAVEPOINT` al recibir un 23505. `nextQuoteNumber` no tiene ni el indice ni
el reintento, y por eso todavia puede duplicar numero en silencio.

Cuatro permisos nuevos: `invoices.view`, `invoices.create`, `invoices.cancel` e
`invoices.archive`.

### Fase 9 - Fuera los contratos, el conduce cobra

El flujo son tres documentos: **cotizacion -> orden -> conduce**. El contrato
desaparecio; el conduce paso a ser el documento de dinero. La fase 9.3 movio ese
papel a la factura: lo que sigue describe el paso intermedio.

**Un pago cuelga de UN documento.** Antes tenia doble ancla, contrato o
cotizacion, que es lo que hacia que el saldo se mirase en un sitio y se cobrase
en otro. `payments` perdio `contract_id` y `quotation_id`; el ancla es hoy
`invoice_id NOT NULL` (ver fase 9.3).

La migracion **011** borra `contracts` y **descarta los pagos existentes**: un
pago colgaba de un contrato o de una cotizacion, y una cotizacion puede tener
varios conduces —uno por cada entrega parcial y cada devolucion—, asi que no
hay forma de decidir a cual pertenece. No hay backfill posible.

Sobre el orden de las migraciones: `contracts` nacia en la **002**, no en la
008 —la 008 solo le anadio indices y CHECKs—, y la **010** la menciona en su
array de tablas con `is_active`. Eso no rompe una base nueva porque la 010 corre
antes que la 011, cuando la tabla todavia existe. Las migraciones aplicadas no
se editan: el runner valida su checksum y aborta si cambian.

`conduces.status` gana por fin un CHECK (`emitido`, `completado`, `anulado`):
hasta ahora no tenia ninguno y la base aceptaba cualquier cadena.

**Cuidado con `packages/reports/src/contracts/`:** no es el contrato legal,
exporta `generateConducePDF`. Borrarlo rompe los PDF de conduce.

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

## Dashboard

Se rehizo contra `DESIGN_SYSTEM.md`, que ya lo especificaba y al que la pantalla
anterior incumplia entero.

### Las cifras estaban mal, no solo mal maquetadas

Ninguna de las seis era un `COUNT`: todas eran `.length` sobre una pagina de
resultados. «Cotizaciones abiertas» y «Ordenes activas» median sobre
`list(limit: 20)` —o sea que respondian *cuantas de las 20 mas recientes estan
abiertas*, no el total— y las otras cuatro se quedaban clavadas en 500.

Ahora hay un `PostgresDashboardRepository` con las seis en **una sola consulta**,
seis subconsultas `COUNT` sobre sus indices. Dos arreglos de datos que venian
con ello:

- Las incidencias abiertas se buscaban en `['reportado','abierto','open']` y
  `IncidentStatus` solo admite `reportado | resuelto | anulado`. Dos de los tres
  valores no existian.
- El dashboard tenia su propia lista de «orden activa», que incluia `devuelto`.
  Ahora usa `ACTIVE_INVENTORY_ORDER_STATUSES` de `packages/core`, la misma que
  gobierna el stock comprometido.

### Flujo y stock no son lo mismo

El selector de periodo (`?dias=7|30|90`) acota lo que es **flujo**: clientes
nuevos, eventos, cotizaciones, ordenes e incidencias. **No acota el
inventario**, que es un stock: «articulos de los ultimos 30 dias» no significa
nada. Esa unica metrica lleva su nota «al dia de hoy» para que no se lea bajo el
periodo.

Los eventos se acotan por su `date`, no por `created_at`, porque `events` no
tiene esa columna — y ademas la fecha del evento es la que importa.

### Capa de formato

`packages/core/src/shared/format.ts` y `business-status.ts`, que es lo que pide
`DESIGN_SYSTEM.md`: `RD$1,500.50`, `20 jun 2026` —relativo por debajo de una
semana— y `—` para el hueco vacio.

`statusLabel` **nunca deja pasar el enum crudo**: lo que no esta en el mapa lo
humaniza (`en_recogida` → «En recogida»). Hace falta porque el SQL casi nunca
tiene `CHECK` y los valores estan repartidos en listas que no coinciden entre
si: el tipo de `@esr/schemas`, las constantes de `operations/use-cases` y las
opciones de cada filtro declaran conjuntos distintos.

`@esr/reports/formatters` no se reutiliza: formatea en `en-US` sin simbolo, y su
`formatDate` es un `slice(0, 10)`. Sirve a los PDF, que no tienen tema ni idioma
del usuario.

**La moneda es una constante, no un dato de la empresa.** No existe columna
`currency` en `companies` ni en `company_info`. `LOCALE` y `CURRENCY` viven en un
solo sitio para que el dia que exista el campo se cambie ahi.

Por ahora **solo lo usa el dashboard**. El resto de la app lo adopta por fases.

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

Donde ya habia estado de negocio (cotizaciones, ordenes, conduces) la
barra lleva **dos selects**. Inventario gano el de categoria, que el repositorio
ya soportaba pero la pantalla no ofrecia; conduces gano busqueda y tipo, que
exigieron ampliar `ConduceListFilters`.

**No hay vista «Todos»**: la lista siempre muestra un estado concreto y la
busqueda respeta el seleccionado.

### La accion primaria va DENTRO de la barra

El boton de alta se renderiza en el snippet `actions` de `<FilterBar>`, al final
de la misma fila: buscador a la izquierda, selects en medio, boton a la derecha.
Antes colgaba de un `.page-header` propio encima, que gastaba una fila entera
para un solo boton.

La accion de **editar** de una fila lleva `.btn-edit`: caja, borde y el ambar
de `--warning-text`, el color que el sistema ya reserva para «esto modifica
algo». Antes era un `.btn-link`, o sea texto suelto del color de los enlaces,
que en una columna de acciones no se distingue de un enlace cualquiera.

`.btn-view` es su gemelo para las filas que solo llevan a mirar: misma
geometria, gris en vez de ambar, y una flecha `→` detras porque navegan a un
detalle. **No usa el acento**: ese se reserva a una accion por pantalla —la
primaria de la barra— y repartirlo por cada fila lo dejaria sin significar
nada.

El borde de los dos va del **color de su texto**, no de un gris:
`--border-strong` da 1.48:1 sobre blanco y a esa distancia no se ve que haya
una caja, que es justo el problema que estos botones vienen a resolver. Ningun
gris del sistema llega a 3:1 en los dos temas.

Los botones que **abren** un alta llevan `.btn-new`, que les pone un `+` con
`::before`. Va en CSS y no en el marcado porque es decorativo —el texto ya dice
que se crea algo— y asi no llega a los lectores de pantalla. Los `submit` de
dentro de un formulario NO lo llevan: esos confirman, no crean.

### Categorias y subcategorias

Son **dos pantallas**, no una: `/settings/categories` y
`/settings/subcategories`. Compartian pantalla y un solo objeto `form`, lo que
obligaba a discriminar cual de los dos formularios habia fallado. Separadas,
cada una tiene su tabla, su barra de filtros y su dialogo.

Subcategorias filtra ademas por categoria padre, y hereda la categoria filtrada
al abrir el alta. Su nombre solo tiene que ser unico **dentro** de su categoria,
que es la razon por la que nunca uso el helper generico de catalogos.

Ninguna de las dos tiene pantalla de detalle, asi que **el estado se cambia
desde su dialogo**: es el unico sitio donde se puede archivar una. La fila
conserva el Desactivar/Reactivar como accion rapida.

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
