import { ICONS } from '@esr/ui/icons';

/**
 * Menu plano de ESR Pro, sin subdivisiones, con la misma iconografia
 * compartida que ESR Cloud.
 */
export const navItems = [
	{ path: '/', label: 'Dashboard', icon: ICONS.dashboard },
	{ path: '/quotations', label: 'Cotizaciones', icon: ICONS.quotes },
	{ path: '/work_orders', label: 'Órdenes de Trabajo', icon: ICONS.workOrders },
	// Orden documental: cotizacion -> orden -> conduce -> factura. El conduce no
	// esta en el menu (ver `hiddenTitles`).
	{ path: '/invoices', label: 'Facturas', icon: ICONS.invoices },
	{ path: '/events', label: 'Eventos', icon: ICONS.events },
	{ path: '/clients', label: 'Clientes', icon: ICONS.customers },
	{ path: '/items', label: 'Inventario', icon: ICONS.inventory },
	// Paquetes no existe en Cloud; va junto a Inventario, que es lo que agrupa.
	{ path: '/packages', label: 'Paquetes', icon: ICONS.packages },
	{ path: '/reports', label: 'Reportes', icon: ICONS.reports },
	{ path: '/incidents', label: 'Incidencias', icon: ICONS.incidents },
	{ path: '/settings', label: 'Ajustes', icon: ICONS.settings },
	{ path: '/docs', label: 'Documentación', icon: ICONS.docs }
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
	{ path: '/conduces', label: 'Conduces' },
	{ path: '/checklist', label: 'Checklist' }
];

export function isNavActive(pathname, path) {
	if (path === '/') return pathname === '/';
	return pathname === path || pathname.startsWith(path + '/');
}

export function resolvePageTitle(pathname) {
	const match =
		navItems.find((item) => isNavActive(pathname, item.path)) ??
		hiddenTitles.find((item) => isNavActive(pathname, item.path));
	return match ? match.label : 'Control Operativo';
}
