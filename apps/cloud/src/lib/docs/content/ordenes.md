## La lista de órdenes

Igual que Cotizaciones: número (`ORD-000001`), cliente, evento, fecha,
estado y total, con un rango de fechas por defecto (configurable en
Configuración › Generales), botones rápidos de periodo, un "Desde"/
"Hasta" propio, un buscador en vivo (número, cliente, evento o
responsable) y una lupa aparte para buscar por número fuera del rango
visible.

El filtro **Estado de la orden** ofrece: Confirmado, En preparación,
Entregado, Parcialmente devuelto, Devuelto, Cerrado y Cancelado —el
ciclo de vida completo de una orden, descrito abajo.

## Dos formas de crear una orden

- **Desde una cotización aprobada**, con el botón **Convertir a
  orden** de su ficha (ver *Cotizaciones*). La orden queda enlazada a
  esa cotización —su ficha lo muestra en "Cotización origen"— y hereda
  sus líneas.
- **Directa, con el botón Nueva orden**, sin pasar por una cotización.
  A diferencia de una cotización —que no aparta nada hasta
  convertirse—, una orden directa **nace confirmada y aparta el stock
  de sus artículos de inmediato**.

El formulario de orden directa pide Cliente\*, Evento vinculado
(opcional), Fecha de operación, el rango Alquiler desde/hasta,
Responsable o chofer, Vehículo asignado, y notas de montaje. Los
equipos se agregan igual que en una cotización: un buscador del
catálogo a la izquierda —cada artículo muestra cuánto tiene **Libre**
en ese periodo— y la tabla de la orden a la derecha; agregar el mismo
artículo dos veces suma la cantidad en vez de duplicar la línea.

A diferencia de una cotización, **una línea de orden no lleva
descuento ni impuesto**: el importe es solo Cantidad × Precio, y el
total es la suma de las líneas. Si pide más de lo que hay Libre, la
pantalla lo advierte pero lo deja intentar — quien de verdad lo
bloquea es el servidor, revisando la existencia real para ese rango de
fechas al crear la orden.

## El ciclo de vida de una orden

| Estado | Qué significa |
| --- | --- |
| Confirmado | Recién creada; el stock de sus artículos queda reservado. |
| En preparación | Se está alistando el equipo. |
| Entregado | Todo lo reservado ya salió. |
| Parcialmente devuelto | Ya volvió parte de lo entregado, no todo. |
| Devuelto | Volvió todo lo que había salido. |
| Cerrado | Cerrada. Ya no se puede tocar. |
| Cancelado | Cancelada. Ya no se puede tocar. |

Los botones disponibles cambian según el estado: **Preparar orden**
(Confirmado → En preparación), **Registrar entrega** (desde Confirmado
o En preparación), **Registrar devolución** (desde Entregado o
Parcialmente devuelto) y **Cerrar orden** (desde Devuelto). Ninguno de
los dos casos finales —Cerrado o Cancelado— admite ninguna acción más.

Una orden **no tiene un editor de líneas** como una cotización: los
artículos y cantidades quedan fijados al crearla. Lo que sí cambia
después es cuánto de cada línea se ha entregado y devuelto, que se
registra con las acciones de abajo.

Desde cualquier estado puede **imprimir la orden** o abrir sus
**checklists de salida y retorno** —quedan disponibles incluso ya
cerrada, para consultar qué salió y qué volvió realmente—.

## Entregar y devolver

**Registrar entrega** abre una pantalla con lo pendiente de cada línea
—para artículos con serial, marca las unidades exactas que salen—,
más Receptor, Documento y Notas. Al **Completar entrega**, el sistema
genera el conduce de esa entrega automáticamente: no hay que crear ese
documento aparte, es lo que produce este mismo paso.

**Registrar devolución** funciona igual, pero por cada línea se elige
la condición en que vuelve —Bueno, Regular, Dañado o Perdido— y notas.
**Completar devolución** genera el conduce de devolución. Si algo
vuelve como **Dañado** o **Perdido**, se abre una incidencia sola, sin
que nadie tenga que registrarla a mano.

## Incidencias

Con la orden ya Entregada o Parcialmente devuelta, **Registrar
incidencia** pide Tipo (Daño, Faltante/pérdida, Nota operativa u
Otro), Severidad, el Artículo afectado (opcional), un Costo estimado y
una Descripción. Las incidencias abiertas se resuelven con
**Resolver**, reservado a Gerente o Administrador.

## Facturar

El panel de Facturas de la orden muestra **Facturar** solo cuando hay
algo entregado que todavía no se ha cobrado. Es la misma regla de
Cotizaciones e Introducción: **solo se factura lo que ya se
entregó** — confirmar o preparar una orden no habilita facturarla,
hace falta la entrega.

## Cerrar o cancelar

**Cerrar orden** solo aparece con la orden en Devuelto, y el servidor
la rechaza si queda algo por devolver o alguna incidencia sin
resolver. **Cancelar la orden** solo está disponible mientras sigue en
Confirmado —antes de cualquier entrega— y libera de inmediato el stock
que había reservado.

Las dos acciones están reservadas a los roles Gerente y Administrador;
crear, preparar, entregar y devolver una orden están al alcance de
cualquier rol con acceso a Órdenes. Consulte *Roles y Permisos* para
el detalle completo.
