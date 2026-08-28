import type { Permission } from '@esr/core';

export type NavItemConfig = {
	href: string;
	label: string;
	icon: string;
	matchPrefix: string;
	/** Permiso minimo para ver la entrada. Sin permiso no se renderiza. */
	permission: Permission;
	disabled?: boolean;
};

export type NavGroupConfig = {
	title: string;
	items: NavItemConfig[];
};

export const navGroups: NavGroupConfig[] = [
	{
		title: 'General',
		items: [
			{
				href: '/dashboard',
				label: 'Dashboard',
				icon: '◫',
				matchPrefix: '/dashboard',
				permission: 'customers.view'
			}
		]
	},
	{
		title: 'Operación',
		items: [
			{ href: '/customers', label: 'Clientes', icon: '◉', matchPrefix: '/customers', permission: 'customers.view' },
			{ href: '/events', label: 'Eventos', icon: '◷', matchPrefix: '/events', permission: 'events.view' },
			{ href: '/inventory', label: 'Inventario', icon: '▣', matchPrefix: '/inventory', permission: 'inventory.view' }
			// Paquetes: ruta no implementada aún
		]
	},
	{
		title: 'Comercial',
		items: [
			{ href: '/quotes', label: 'Cotizaciones', icon: '◎', matchPrefix: '/quotes', permission: 'quotes.view' },
			{ href: '/work-orders', label: 'Órdenes', icon: '◈', matchPrefix: '/work-orders', permission: 'work_orders.view' }
		]
	},
	{
		title: 'Logística',
		items: [
			{ href: '/conduces', label: 'Conduces', icon: '⇄', matchPrefix: '/conduces', permission: 'conduces.view' },
			{ href: '/incidents', label: 'Incidencias', icon: '⚠', matchPrefix: '/incidents', permission: 'incidents.view' }
		]
	},
	{
		title: 'Análisis',
		items: [
			{ href: '/reports', label: 'Reportes', icon: '▤', matchPrefix: '/reports', permission: 'reports.view' }
		]
	},
	{
		title: 'Sistema',
		items: [
			{ href: '/settings', label: 'Configuración', icon: '⚙', matchPrefix: '/settings', permission: 'settings.view' },
			{ href: '/audit', label: 'Auditoría', icon: '◔', matchPrefix: '/audit', permission: 'audit.view' }
		]
	}
];

const pageMeta: Array<{ prefix: string; title: string; subtitle: string }> = [
	{ prefix: '/dashboard', title: 'Dashboard', subtitle: 'Gestión general de operaciones' },
	{ prefix: '/customers', title: 'Clientes', subtitle: 'Directorio de clientes de la empresa' },
	{ prefix: '/inventory', title: 'Inventario', subtitle: 'Artículos y disponibilidad' },
	{ prefix: '/events', title: 'Eventos', subtitle: 'Calendario y reservas' },
	{ prefix: '/quotes', title: 'Cotizaciones', subtitle: 'Propuestas comerciales' },
	{ prefix: '/work-orders', title: 'Órdenes', subtitle: 'Operación y entregas' },
	{ prefix: '/conduces', title: 'Conduces', subtitle: 'Entregas y devoluciones' },
	{ prefix: '/incidents', title: 'Incidencias', subtitle: 'Seguimiento operativo' },
	{ prefix: '/reports', title: 'Reportes', subtitle: 'Consultas operativas básicas' },
	{ prefix: '/settings/company', title: 'Datos de la empresa', subtitle: 'Información que aparece en los documentos' },
	{ prefix: '/settings/members', title: 'Miembros', subtitle: 'Usuarios y roles de la empresa' },
	{ prefix: '/settings', title: 'Configuración', subtitle: 'Ajustes de la empresa activa' },
	{ prefix: '/audit', title: 'Auditoría', subtitle: 'Registro de acciones críticas' }
];

export function resolvePageMeta(pathname: string): { title: string; subtitle: string } {
	const match = pageMeta.find((entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`));
	return match ?? { title: 'ESR Cloud', subtitle: 'Plataforma operativa' };
}

export function isNavActive(pathname: string, matchPrefix: string): boolean {
	if (matchPrefix === '/dashboard') return pathname === '/dashboard';
	return pathname === matchPrefix || pathname.startsWith(`${matchPrefix}/`);
}

/**
 * Grupos visibles para un conjunto de permisos. Los grupos que quedan vacios
 * desaparecen para no dejar titulos huerfanos en el sidebar.
 */
export function visibleNavGroups(permissions: readonly string[] = []): NavGroupConfig[] {
	return navGroups
		.map((group) => ({
			...group,
			items: group.items.filter((item) => permissions.includes(item.permission))
		}))
		.filter((group) => group.items.length > 0);
}
