## Qué es ESR Pro

ESR Pro es la aplicación de escritorio de ESR, el sistema para operar
inventario, eventos, alquileres, cotizaciones, conduces y contratos del flujo
**Events Stock & Rentals**.

Funciona sin conexión: los datos viven en una base SQLite en el propio equipo.

Comparte núcleo con **ESR Cloud**, la versión web: las mismas reglas de negocio,
los mismos documentos imprimibles y la misma iconografía. Lo que cambia es dónde
viven los datos y quién puede entrar.

| | ESR Pro (escritorio) | ESR Cloud (web) |
| --- | --- | --- |
| Base de datos | SQLite local | PostgreSQL |
| Acceso | Un equipo | Varios usuarios a la vez |
| Empresas | Una | Varias, aisladas entre sí |
| Respaldo | Local | Centralizado |

## A quién está dirigido

Este manual es para quien usa ESR Pro a diario: personal de operaciones,
almacén, ventas y administración. No hace falta conocimiento técnico.

Cada sección describe un módulo completo: qué se ve, qué acciones ofrece, qué
campos pide y cómo encaja en el flujo de trabajo general.

## Cómo está organizado

El manual sigue el orden natural del trabajo, no el del menú:

1. **Introducción** — esta sección y los primeros pasos.
2. **Comercial** — de la cotización a la orden de trabajo.
3. **Logística** — conduces, entregas, devoluciones e incidencias.
4. **Operación** — los catálogos que alimentan todo: eventos, clientes, inventario y paquetes.
5. **Análisis** — reportes.
6. **Administración** — configuración y usuarios.

Las secciones marcadas como **En redacción** todavía no tienen texto: muestran
el esquema previsto para que se sepa qué cubrirán.

## El flujo en una línea

El recorrido habitual de principio a fin:

```
Cliente → Evento → Cotización → Aprobación → Orden de trabajo
→ Preparación → Conduce de entrega → Devolución → Cierre
```

Si algo sale mal en el camino —un equipo dañado o un faltante— se registra como
**incidencia** y queda ligada a la orden.
