export type NavItemConfig = {
	href: string;
	label: string;
	icon: string;
	matchPrefix: string;
	disabled?: boolean;
};

export type NavGroupConfig = {
	title: string;
	items: NavItemConfig[];
};

export const navGroups: NavGroupConfig[] = [
	{
		title: 'General',
		items: [{ href: '/dashboard', label: 'Dashboard', icon: '◫', matchPrefix: '/dashboard' }]
	},
	{
		title: 'Operación',
		items: [
			{ href: '/customers', label: 'Clientes', icon: '◉', matchPrefix: '/customers' },
			{ href: '/events', label: 'Eventos', icon: '◷', matchPrefix: '/events' },
			{ href: '/inventory', label: 'Inventario', icon: '▣', matchPrefix: '/inventory' }
			// Paquetes: ruta no implementada aún
		]
	},
	{
		title: 'Comercial',
		items: [
			{ href: '/quotes', label: 'Cotizaciones', icon: '◎', matchPrefix: '/quotes' },
			{ href: '/work-orders', label: 'Órdenes', icon: '◈', matchPrefix: '/work-orders' }
		]
	},
	{
		title: 'Logística',
		items: [
			{ href: '/conduces', label: 'Conduces', icon: '⇄', matchPrefix: '/conduces' },
			{ href: '/incidents', label: 'Incidencias', icon: '⚠', matchPrefix: '/incidents' }
		]
	},
	{
		title: 'Análisis',
		items: [{ href: '/reports', label: 'Reportes', icon: '▤', matchPrefix: '/reports' }]
	},
	{
		title: 'Sistema',
		items: [{ href: '/audit', label: 'Auditoría', icon: '◔', matchPrefix: '/audit' }]
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
