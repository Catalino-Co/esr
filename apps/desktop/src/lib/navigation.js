import { ICONS } from '@esr/ui/icons';

/**
 * Menu plano de ESR Pro, sin subdivisiones, con la misma iconografia
 * compartida que ESR Cloud.
 *
 * Cada entrada declara el PERMISO que hace falta para verla, tomado del mismo
 * catalogo de `@esr/core` que usa Cloud. Filtrar el menu es cortesia, no
 * seguridad: ver `$lib/can.js`.
 */
export const navItems = [
	{ path: '/', label: 'Dashboard', icon: ICONS.dashboard, subtitle: 'Resumen de la operación', permission: 'reports.view' },
	{ path: '/quotations', label: 'Cotizaciones', icon: ICONS.quotes, subtitle: 'Propuestas comerciales', permission: 'quotes.view' },
	{ path: '/work_orders', label: 'Órdenes', icon: ICONS.workOrders, subtitle: 'Operación y entregas', permission: 'work_orders.view' },
	// Orden documental: cotizacion -> orden -> conduce -> factura. El conduce no
	// esta en el menu (ver `hiddenTitles`).
	{ path: '/invoices', label: 'Facturas', icon: ICONS.invoices, subtitle: 'Documentos de cobro y estado de cuenta', permission: 'invoices.view' },
	{ path: '/events', label: 'Eventos', icon: ICONS.events, subtitle: 'Calendario y reservas', permission: 'events.view' },
	{ path: '/clients', label: 'Clientes', icon: ICONS.customers, subtitle: 'Directorio de clientes de la empresa', permission: 'customers.view' },
	{ path: '/items', label: 'Inventario', icon: ICONS.inventory, subtitle: 'Existencias por almacén', permission: 'inventory.view' },
	// Paquetes no existe en Cloud; va junto a Inventario, que es lo que agrupa.
	{ path: '/packages', label: 'Paquetes', icon: ICONS.packages, subtitle: 'Artículos que se alquilan juntos', permission: 'packages.view' },
	{ path: '/reports', label: 'Reportes', icon: ICONS.reports, subtitle: 'Consultas operativas básicas', permission: 'reports.view' },
	{ path: '/incidents', label: 'Incidencias', icon: ICONS.incidents, subtitle: 'Seguimiento operativo', permission: 'incidents.view' },
	{ path: '/settings', label: 'Ajustes', icon: ICONS.settings, subtitle: 'Configuración del sistema', permission: 'settings.view' },
	{ path: '/docs', label: 'Documentación', icon: ICONS.docs, subtitle: 'Manual de usuario de ESR Pro' }
];

/**
 * Rutas vivas que NO estan en el menu.
 *
 * El conduce sale del menu igual que en Cloud: es la nota de entrega, no un
 * modulo que se visite por su cuenta. Se llega a el desde la orden —boton
 * «Conduce»— y desde la factura, que enlaza las entregas que cubre. La ruta
 * sigue funcionando; sin esta tabla el titulo de la cabecera caeria al
 * generico.
 */
const hiddenTitles = [
	// Se llega desde Inventario, con el botón de la fila o el enlace de arriba.
	{ path: '/movements', label: 'Movimientos', subtitle: 'Qué entró, qué salió y quién lo movió' },
	{ path: '/conduces', label: 'Conduces', subtitle: 'Notas de entrega de la operación' },
	{ path: '/checklist', label: 'Checklist', subtitle: 'Verificación de salida y retorno' }
];

/** Las entradas que el rol puede ver. Sin rol, ninguna. */
export function visibleNavItems(puede) {
	return navItems.filter((item) => !item.permission || puede(item.permission));
}

export function isNavActive(pathname, path) {
	if (path === '/') return pathname === '/';
	return pathname === path || pathname.startsWith(path + '/');
}

/**
 * Titulo y subtitulo de la cabecera, como `resolvePageMeta` de Cloud. El
 * subtitulo no es adorno: es lo que dice de que va la pantalla cuando el
 * titulo es una sola palabra («Clientes», «Facturas»).
 */
export function resolvePageMeta(pathname) {
	const match =
		navItems.find((item) => isNavActive(pathname, item.path)) ??
		hiddenTitles.find((item) => isNavActive(pathname, item.path));
	return match
		? { title: match.label, subtitle: match.subtitle ?? '' }
		: { title: 'ESR Pro', subtitle: 'Control operativo' };
}
