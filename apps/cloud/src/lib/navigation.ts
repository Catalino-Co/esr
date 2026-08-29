import type { Permission } from '@esr/core';
import { ICONS } from '@esr/ui/icons';

export type NavItemConfig = {
	href: string;
	label: string;
	icon: string;
	matchPrefix: string;
	/**
	 * Permiso minimo para ver la entrada. `null` = visible para cualquier
	 * miembro con empresa activa (el manual, por ejemplo, no se restringe).
	 */
	permission: Permission | null;
	disabled?: boolean;
};

/**
 * Menu plano, sin subdivisiones. Igual que CCO Workshop: los items se
 * separan visualmente por espaciado, no por titulos de seccion.
 */
export const navItems: NavItemConfig[] = [
	{
		href: '/dashboard',
		label: 'Dashboard',
		icon: ICONS.dashboard,
		matchPrefix: '/dashboard',
		permission: 'customers.view'
	},
	{
		href: '/quotes',
		label: 'Cotizaciones',
		icon: ICONS.quotes,
		matchPrefix: '/quotes',
		permission: 'quotes.view'
	},
	{
		href: '/contracts',
		label: 'Contratos',
		icon: ICONS.contracts,
		matchPrefix: '/contracts',
		permission: 'contracts.view'
	},
	{
		href: '/work-orders',
		label: 'Órdenes',
		icon: ICONS.workOrders,
		matchPrefix: '/work-orders',
		permission: 'work_orders.view'
	},
	{
		href: '/conduces',
		label: 'Conduces',
		icon: ICONS.conduces,
		matchPrefix: '/conduces',
		permission: 'conduces.view'
	},
	{
		href: '/events',
		label: 'Eventos',
		icon: ICONS.events,
		matchPrefix: '/events',
		permission: 'events.view'
	},
	{
		href: '/customers',
		label: 'Clientes',
		icon: ICONS.customers,
		matchPrefix: '/customers',
		permission: 'customers.view'
	},
	{
		href: '/inventory',
		label: 'Inventario',
		icon: ICONS.inventory,
		matchPrefix: '/inventory',
		permission: 'inventory.view'
	},
	{
		href: '/packages',
		label: 'Paquetes',
		icon: ICONS.packages,
		matchPrefix: '/packages',
		permission: 'packages.view'
	},
	{
		href: '/reports',
		label: 'Reportes',
		icon: ICONS.reports,
		matchPrefix: '/reports',
		permission: 'reports.view'
	},
	{
		href: '/audit',
		label: 'Auditoría',
		icon: ICONS.audit,
		matchPrefix: '/audit',
		permission: 'audit.view'
	},
	{
		href: '/incidents',
		label: 'Incidencias',
		icon: ICONS.incidents,
		matchPrefix: '/incidents',
		permission: 'incidents.view'
	},
	{
		href: '/settings',
		label: 'Configuración',
		icon: ICONS.settings,
		matchPrefix: '/settings',
		permission: 'settings.view'
	},
	{
		href: '/docs',
		label: 'Documentación',
		icon: ICONS.docs,
		matchPrefix: '/docs',
		// El manual no se restringe: explica la app, no expone datos.
		permission: null
	}
];

const pageMeta: Array<{ prefix: string; title: string; subtitle: string }> = [
	{ prefix: '/dashboard', title: 'Dashboard', subtitle: 'Gestión general de operaciones' },
	{ prefix: '/customers', title: 'Clientes', subtitle: 'Directorio de clientes de la empresa' },
	{ prefix: '/inventory', title: 'Inventario', subtitle: 'Artículos y disponibilidad' },
	{ prefix: '/events', title: 'Eventos', subtitle: 'Calendario y reservas' },
	{ prefix: '/quotes', title: 'Cotizaciones', subtitle: 'Propuestas comerciales' },
	{ prefix: '/contracts', title: 'Contratos', subtitle: 'Acuerdos firmados y estado de cuenta' },
	{ prefix: '/work-orders', title: 'Órdenes', subtitle: 'Operación y entregas' },
	{ prefix: '/conduces', title: 'Conduces', subtitle: 'Entregas y devoluciones' },
	{ prefix: '/incidents', title: 'Incidencias', subtitle: 'Seguimiento operativo' },
	{ prefix: '/packages', title: 'Paquetes', subtitle: 'Artículos que se alquilan juntos' },
	{ prefix: '/reports', title: 'Reportes', subtitle: 'Consultas operativas básicas' },
	{
		prefix: '/settings/appearance',
		title: 'Apariencia',
		subtitle: 'Tema visual de la aplicación'
	},
	{
		prefix: '/settings/company',
		title: 'Datos de la empresa',
		subtitle: 'Información que aparece en los documentos'
	},
	{ prefix: '/settings/members', title: 'Miembros', subtitle: 'Usuarios y roles de la empresa' },
	{ prefix: '/settings/categories', title: 'Categorías', subtitle: 'Organizan el inventario. Cada categoría puede tener subcategorías.' },
	{ prefix: '/settings/event-types', title: 'Tipos de evento', subtitle: 'Clasifican los eventos de la empresa y aparecen en los reportes.' },
	{ prefix: '/settings/suppliers', title: 'Proveedores', subtitle: 'Empresas y personas a las que se subcontrata equipo o servicios.' },
	{ prefix: '/settings/collaborators', title: 'Colaboradores', subtitle: 'Equipo que ejecuta la operación: técnicos, choferes y montaje.' },
	{ prefix: '/settings', title: 'Configuración', subtitle: 'Ajustes de la empresa activa' },
	{ prefix: '/audit', title: 'Auditoría', subtitle: 'Registro de acciones críticas' },
	{ prefix: '/docs', title: 'Documentación', subtitle: 'Manual de usuario de ESR Cloud' }
];

export function resolvePageMeta(pathname: string): { title: string; subtitle: string } {
	const match = pageMeta.find(
		(entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
	);
	return match ?? { title: 'ESR Cloud', subtitle: 'Plataforma operativa' };
}

export function isNavActive(pathname: string, matchPrefix: string): boolean {
	if (matchPrefix === '/dashboard') return pathname === '/dashboard';
	return pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`);
}

/** Items visibles para un conjunto de permisos. */
export function visibleNavItems(permissions: readonly string[] = []): NavItemConfig[] {
	return navItems.filter((item) => !item.permission || permissions.includes(item.permission));
}
