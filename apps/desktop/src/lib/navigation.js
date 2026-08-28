import { ICONS } from '@esr/ui/icons';

/**
 * Menu plano de ESR Pro, sin subdivisiones, con la misma iconografia
 * compartida que ESR Cloud.
 */
export const navItems = [
	{ path: '/', label: 'Dashboard', icon: ICONS.dashboard },
	{ path: '/quotations', label: 'Cotizaciones', icon: ICONS.quotes },
	{ path: '/work_orders', label: 'Órdenes de Trabajo', icon: ICONS.workOrders },
	{ path: '/conduces', label: 'Conduces', icon: ICONS.conduces },
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

export function isNavActive(pathname, path) {
	if (path === '/') return pathname === '/';
	return pathname === path || pathname.startsWith(path + '/');
}

export function resolvePageTitle(pathname) {
	const match = navItems.find((item) => isNavActive(pathname, item.path));
	return match ? match.label : 'Control Operativo';
}
