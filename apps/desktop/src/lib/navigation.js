import { ICONS } from '@esr/ui/icons';

/**
 * Menu plano de ESR Pro, sin subdivisiones, con la misma iconografia
 * compartida que ESR Cloud.
 */
export const navItems = [
	{ path: '/', label: 'Dashboard', icon: ICONS.dashboard },
	{ path: '/clients', label: 'Clientes', icon: ICONS.customers },
	{ path: '/events', label: 'Eventos', icon: ICONS.events },
	{ path: '/items', label: 'Inventario', icon: ICONS.inventory },
	{ path: '/packages', label: 'Paquetes', icon: ICONS.packages },
	{ path: '/quotations', label: 'Cotizaciones', icon: ICONS.quotes },
	{ path: '/work_orders', label: 'Órdenes de Trabajo', icon: ICONS.workOrders },
	{ path: '/conduces', label: 'Conduces', icon: ICONS.conduces },
	{ path: '/incidents', label: 'Incidencias', icon: ICONS.incidents },
	{ path: '/reports', label: 'Reportes', icon: ICONS.reports },
	{ path: '/settings', label: 'Ajustes', icon: ICONS.settings }
];

export function isNavActive(pathname, path) {
	if (path === '/') return pathname === '/';
	return pathname === path || pathname.startsWith(path + '/');
}

export function resolvePageTitle(pathname) {
	const match = navItems.find((item) => isNavActive(pathname, item.path));
	return match ? match.label : 'Control Operativo';
}
