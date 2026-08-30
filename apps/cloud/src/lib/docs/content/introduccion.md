## Qué es ESR Cloud

ESR Cloud es la versión web y multiusuario de ESR, el sistema para operar
inventario, eventos, alquileres, cotizaciones, órdenes y facturas del flujo
**Events Stock & Rentals**.

Comparte núcleo con **ESR Pro**, la aplicación de escritorio: las mismas reglas
de negocio, los mismos documentos imprimibles y la misma iconografía. Lo que
cambia es dónde viven los datos y quién puede entrar.

| | ESR Pro (escritorio) | ESR Cloud (web) |
| --- | --- | --- |
| Base de datos | SQLite local | PostgreSQL |
| Acceso | Un equipo | Varios usuarios a la vez |
| Empresas | Una | Varias, aisladas entre sí |
| Respaldo | Local | Centralizado |

## A quién está dirigido

Este manual es para quien usa ESR Cloud a diario: personal de operaciones,
almacén, ventas y administración. No hace falta conocimiento técnico.

Cada sección describe un módulo completo: qué se ve, qué acciones ofrece, qué
campos pide y cómo encaja en el flujo de trabajo general.

## Cómo está organizado

El manual sigue el orden natural del trabajo, no el del menú:

1. **Introducción** — esta sección y los primeros pasos.
2. **Comercial** — de la cotización a la orden de trabajo.
3. **Logística** — entregas, devoluciones e incidencias.
4. **Cobro** — facturas y estado de cuenta.
5. **Operación** — los catálogos que alimentan todo: eventos, clientes e inventario.
6. **Análisis** — reportes y auditoría.
7. **Administración** — configuración, roles y modelo multiempresa.

Las secciones marcadas como **En redacción** todavía no tienen texto: muestran
el esquema previsto para que se sepa qué cubrirán.

## El flujo en una línea

El recorrido habitual de principio a fin:

```
Cliente → Evento → Cotización → Aprobación → Orden de trabajo
→ Preparación → Entrega → Factura → Devolución → Cierre
```

Si algo sale mal en el camino —un equipo dañado o un faltante— se registra como
**incidencia** y queda ligada a la orden.

Una precisión sobre el cobro: **solo se factura lo que ya se entregó**. Cada
entrega genera su nota de entrega, y la factura cubre una o varias de esas
entregas. Una devolución nunca genera factura, porque no se cobra lo que
vuelve.

## Antes de empezar

Dos ideas que conviene tener claras desde el principio:

- **Todo ocurre dentro de una empresa activa.** Si perteneces a más de una,
  eliges cuál al entrar, y todo lo que veas y hagas pertenece solo a esa.
- **Tu rol decide qué puedes hacer.** Si una acción no aparece, es porque tu rol
  no la permite. Consulta *Roles y Permisos* para ver la matriz completa.
