import { ICONS } from '@esr/ui/icons';

/**
 * Menu plano de ESR Pro, sin subdivisiones, con la misma iconografia
 * compartida que ESR Cloud.
 */
export const navItems = [
	{ path: '/', label: 'Dashboard', icon: ICONS.dashboard, subtitle: 'Resumen de la operación' },
	{ path: '/quotations', label: 'Cotizaciones', icon: ICONS.quotes, subtitle: 'Propuestas comerciales' },
	{ path: '/work_orders', label: 'Órdenes de Trabajo', icon: ICONS.workOrders, subtitle: 'Operación y entregas' },
	// Orden documental: cotizacion -> orden -> conduce -> factura. El conduce no
	// esta en el menu (ver `hiddenTitles`).
	{ path: '/invoices', label: 'Facturas', icon: ICONS.invoices, subtitle: 'Documentos de cobro y estado de cuenta' },
	{ path: '/events', label: 'Eventos', icon: ICONS.events, subtitle: 'Calendario y reservas' },
	{ path: '/clients', label: 'Clientes', icon: ICONS.customers, subtitle: 'Directorio de clientes de la empresa' },
	{ path: '/items', label: 'Inventario', icon: ICONS.inventory, subtitle: 'Artículos y disponibilidad' },
	// Paquetes no existe en Cloud; va junto a Inventario, que es lo que agrupa.
	{ path: '/packages', label: 'Paquetes', icon: ICONS.packages, subtitle: 'Artículos que se alquilan juntos' },
	{ path: '/reports', label: 'Reportes', icon: ICONS.reports, subtitle: 'Consultas operativas básicas' },
	{ path: '/incidents', label: 'Incidencias', icon: ICONS.incidents, subtitle: 'Seguimiento operativo' },
	{ path: '/settings', label: 'Ajustes', icon: ICONS.settings, subtitle: 'Configuración del sistema' },
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
	{ path: '/conduces', label: 'Conduces', subtitle: 'Notas de entrega de la operación' },
	{ path: '/checklist', label: 'Checklist', subtitle: 'Verificación de salida y retorno' }
];

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
