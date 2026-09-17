## El catálogo de artículos

**Artículos** (Configuración › Artículos, `/settings/articles`) es el catálogo:
qué artículos existen, su unidad, su proveedor y su estado de publicación.
Cuánto hay de cada uno se ve aparte, en Inventario — más abajo en esta misma
sección.

La lista se filtra por Estado (Activo/Inactivo/Archivado), Categoría y
Subcategoría, con un buscador por nombre o código. Sus columnas son Código,
Nombre, Categoría, Unidad, Subcategoría y Precio de alquiler, más una columna
titulada **Publicación** —no "Estado"—: decide si el artículo se puede
cotizar o incluir en una orden, que es un asunto distinto de su condición
física (disponible, en mantenimiento…), que se administra desde Inventario.

## Crear un artículo

El botón **Nuevo artículo** abre un formulario con Código/SKU (se genera uno
a partir de la categoría si se deja en blanco), Nombre\*, Categoría,
Subcategoría (deshabilitada hasta elegir categoría), Proveedor, Unidad de
medida, Precio de alquiler, Precio de compra, la casilla **Tiene existencias
propias** (marcada por defecto) y Notas.

El artículo **nace en cero**: no hay campo de cantidad inicial en el alta,
porque la existencia entra siempre por un movimiento de inventario (ver más
abajo). Si se elige un Proveedor en el alta, queda guardado como su
proveedor **principal** de una vez —no hace falta repetir el paso en la
ficha—. Al crear, la pantalla no se queda en la lista: pasa directo a la
ficha del artículo nuevo, que es donde se termina de ubicarlo en almacenes o,
si es serializado, donde se dan de alta sus unidades.

## La ficha de un artículo

Repite los mismos campos del alta —Nombre, Código/SKU, Categoría, Unidad de
medida, Precio de alquiler, Precio de compra, Notas— más **Tipo de control**
y **Estado**. Guardar la ficha **nunca mueve stock**: para cambiar cuánto hay
de un artículo se usa un movimiento de inventario, no este formulario.

El campo **Estado** solo aparece para quien puede archivar artículos, y
tiene tres valores:

| Estado | Qué significa |
| --- | --- |
| Activo | Se puede editar, cotizar e incluir en órdenes con normalidad. |
| Inactivo | Bloquea la ficha entera: no se puede usar ni editar. |
| Archivado | Igual que Inactivo, pero es el retiro definitivo del catálogo. |

Con el artículo Inactivo o Archivado, la ficha se bloquea entera —la pantalla
lo avisa con *"Este artículo está inactivo/archivado: no se puede usar ni
editar"* y ofrece **reactivarlo** cambiando el Estado de vuelta a Activo,
que es lo único que se puede tocar en ese momento—. Cambiar el Estado
sincroniza sola la condición física del artículo en Inventario: Inactivo lo
deja "No disponible" y Archivado lo deja "Retirado"; al reactivarlo vuelve a
"Disponible".

## Por cantidad o por número de serie

**Tipo de control** decide cómo se cuenta la existencia de un artículo:

- **Por cantidad**: un número por almacén, como cualquier mercancía a granel.
- **Por número de serie**: cada unidad física es su propio registro, con su
  propio almacén y estado. Sirve para saber qué unidad concreta salió a cada
  evento.

Pasar un artículo a serializado no tiene vuelta atrás una vez que ya tiene
unidades registradas: volver a "por cantidad" las dejaría huérfanas.

Un artículo serializado agrega a su ficha la sección **Números de serie**,
con un formulario para **agregar seriales** (uno por línea, más el Almacén
al que entran) y una tabla con Número de serie, Estado, Almacén y Orden.
Agregar texto repetido o ya existente no duplica nada: se ignora en
silencio y, si ya existía en la base, se avisa. Cada alta de seriales queda
registrada como una entrada de inventario.

El **Estado** de cada unidad puede fijarse a mano entre Disponible,
Mantenimiento y Retirado; **Entregado** y **Reservado** no se pueden elegir
manualmente —esos los cambia únicamente la entrega o la devolución de una
orden—, y una unidad entregada muestra un enlace a esa orden en vez de poder
tocarse. Cambiar el **Almacén** de una fila es la forma de trasladar una
unidad serializada de un lado a otro.

## Artículos de renta externa

Desmarcar **Tiene existencias propias** en un artículo es para lo que se
subcontrata a un proveedor en vez de tenerlo en almacén: no se le exige
existencia real en ningún punto del sistema. Al aprobar una cotización,
convertirla en orden o crear una orden directa, ese artículo se trata como
disponibilidad **ilimitada** —nunca bloquea por falta de stock—, y en el
buscador de artículos de una orden su columna "Libre" muestra **"Sin
límite"** en vez de una cantidad. Como consecuencia, su ficha tampoco ofrece
la sección de Almacenes: en su lugar dice que es un artículo de renta
externa y que no se administra en almacenes.

## Almacenes y proveedores del artículo

La ficha de un artículo (con existencias propias) muestra dos tablas más:

**Almacenes** lista en cuáles ya está y cuánto hay en cada uno. **Agregar a
almacén** lo suma a uno nuevo, siempre en cero —no es una forma de darle
stock, solo de decidir dónde puede llegar a haberlo—. Con cantidad en cero
se puede **Quitar** esa fila incluso con la ficha bloqueada, porque no es una
edición del catálogo. Con cantidad mayor que cero se puede **Trasladar**
parte de ella a otro almacén. Ninguna de estas acciones aplica a un artículo
serializado: ahí un almacén se gana dando de alta unidades, y se traslada
moviendo cada unidad en la tabla de seriales.

**Proveedores** lista quién lo suministra —puede haber más de uno—.
**Agregar proveedor** permite marcarlo de una vez como **principal** (se
sugiere marcado si es el primero que se agrega); solo puede haber uno
principal a la vez, y promover a otro le quita la marca al anterior.

## Cuánto hay: la pantalla de Inventario

**Inventario** (`/inventory`) muestra la existencia física por almacén:
Código, Nombre, Categoría, **Total**, **Disponible**, **Mínimo**,
**Condición** y acciones, filtrable por Almacén (recuerda el último
elegido), Categoría, Condición y un buscador, más la casilla **Solo stock
bajo**. Como esta pantalla siempre mira un solo almacén y hoy no hay reserva
por almacén individual, Total y Disponible muestran el mismo número aquí; la
disponibilidad real de toda la empresa —descontando lo comprometido por
órdenes— se ve en *Reportes*.

**Solo stock bajo** compara el Total de ese almacén contra el **Mínimo**, no
contra lo disponible: un artículo con todo alquilado no está en stock bajo,
está ocupado y va a volver. La **Condición física** —Disponible,
Mantenimiento, Retirado o No disponible— es la mercancía en sí; si se puede
cotizar o no es otra cosa, y se decide en el catálogo de Artículos.

Por cada artículo hay cuatro acciones: **Movimiento de stock** (registrar
una entrada, salida o ajuste; deshabilitada en serializados, que se
gestionan por sus seriales), **Existencias por almacén** (una vista de solo
lectura de todos los almacenes, y de las unidades si es serializado),
**Existencias del artículo** (editar el **Mínimo**, la **Condición física**
y la **Ubicación** —pasillo, estante, contenedor…—; guardar esto no mueve ni
una unidad) y el **historial** de movimientos de ese artículo.

## Disponible, comprometido y valorización

El reporte **Inventario disponible** (ver *Reportes*) agrega toda la empresa
y añade dos columnas que no están en `/inventory`: **Comprometido** y
**Valor**. Comprometido es lo que reservan las órdenes activas —confirmada
en adelante, sin importar si ya se entregó— sobre lo pendiente de cada
línea; Disponible es siempre el Total menos ese Comprometido, nunca
negativo. El Valor se calcula con la regla elegida en Configuración ›
Generales, **Último precio de compra** o **Promedio de las 3 últimas
compras**, a partir del costo de las entradas registradas —las que se
hicieron sin costo no cuentan—.

## Movimientos de stock

Una entrada, salida o ajuste se registra únicamente desde el modal
**Movimiento de stock** de Inventario: Almacén, Tipo, Cantidad,
**Costo unitario** (solo para una entrada, opcional) y Observaciones. La
pantalla adelanta en vivo cuánto hay y cuánto va a quedar; un ajuste **fija**
la cantidad final, no la suma a la existente, y el botón se bloquea si el
resultado sería negativo.

**Movimientos** (`/movements`) es el historial, de solo lectura, con rango
de fechas (Esta semana, Este mes, Este año, o uno propio), filtro de Almacén
y de Tipo, y columnas Fecha, Hora, Ítem, Almacén, Tipo, Responsable,
Cantidad y Observaciones. El filtro de Tipo separa los **Manuales** (Entrada,
Salida, Ajuste) de los **Operativos** —Entregado, Devuelto, Dañado, Perdido y
sus reversos—, que ningún formulario de Inventario genera a mano: los
produce automáticamente la entrega, la devolución o la anulación de un
conduce (ver *Órdenes*). Un traslado —entre almacenes o de una unidad
serializada— se registra como dos asientos, una salida en el origen y una
entrada en el destino.

## Catálogos relacionados

Categoría, Subcategoría, Unidad de medida, Proveedor y Almacén de un
artículo se eligen de catálogos que se administran aparte, en Configuración:

| Catálogo | Ruta |
| --- | --- |
| Almacenes | Configuración › Almacenes |
| Categorías | Configuración › Categorías |
| Subcategorías | Configuración › Subcategorías |
| Unidades de medida | Configuración › Unidades de medida |
| Proveedores | Configuración › Proveedores |
| Valoración del inventario | Configuración › Generales |

## Permisos

Ver el catálogo y el Inventario requiere **Ver inventario**; crear un
artículo requiere **Crear artículos**; editar un artículo, sus seriales,
almacenes o proveedores, y registrar movimientos, requieren **Editar
artículos y seriales**; cambiar el Estado de un artículo (archivarlo o
reactivarlo) requiere **Archivar artículos**. Administrar los catálogos de
Almacenes, Categorías, Subcategorías, Unidades de medida y Proveedores es un
permiso aparte y más restringido.

| Rol | Puede |
| --- | --- |
| Lector | Solo ver el catálogo y el inventario. |
| Operador | Además, crear y editar artículos, seriales, almacenes, proveedores y movimientos. |
| Gerente | Además, archivar artículos y administrar los catálogos de Configuración. |
| Administrador | Todo lo anterior, sin restricciones. |

Consulte *Roles y Permisos* para el detalle completo.
