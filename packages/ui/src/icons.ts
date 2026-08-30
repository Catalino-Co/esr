/**
 * Iconografia compartida de ESR.
 *
 * Fuente unica de verdad para Cloud y Desktop: sin esto cada app —y
 * hasta cada pagina— redefinia sus propios glifos y se desincronizaban.
 *
 * Se reutiliza el glifo de CCO Workshop donde el concepto coincide y se
 * conserva el de ESR Pro donde Workshop no tiene equivalente (eventos,
 * conduces, paquetes).
 */
export const ICONS = {
	// Navegacion
	dashboard: '📊',
	customers: '👤',
	events: '📅',
	inventory: '📦',
	packages: '🎁',
	quotes: '📄',
	workOrders: '📋',
	conduces: '🚚',
	invoices: '🧾',
	incidents: '⚠️',
	reports: '📈',
	settings: '⚙️',
	payments: '💰',
	audit: '🔐',
	docs: '📘',

	// Configuracion
	appearance: '🎨',
	company: '🏢',
	categories: '🗂️',
	subcategories: '🏷️',
	eventTypes: '📅',
	suppliers: '🚚',
	collaborators: '👷',
	sectors: '🏭',
	addressTypes: '📍',
	members: '🪪',
	roles: '🛡️',

	// Marca
	brand: '🏢',

	// Controles
	collapse: '«',
	expand: '»',
	logout: '⏻',
	menu: '☰',
	close: '✕',
	search: '🔍',
	back: '←',
	forward: '→',
	print: '🖨️',

	// Apariencia
	themeLight: '☀️',
	themeDark: '🌙'
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): string {
	return ICONS[name];
}
