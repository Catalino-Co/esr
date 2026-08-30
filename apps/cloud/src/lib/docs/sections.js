import { ICONS } from '@esr/ui/icons';

/**
 * Indice del manual de usuario de ESR Cloud. Es la unica fuente de verdad del
 * esqueleto: el indice lateral, la portada, las rutas /docs/[slug], el TOC de
 * cada pagina y la navegacion anterior/siguiente se derivan de aqui.
 *
 * Por ahora solo define la estructura. Para redactar una seccion se crea su
 * archivo en lib/docs/content/<slug>.md y sus temas pasan a salir de los
 * encabezados de ese Markdown.
 */

/**
 * @typedef {{ id: string, title: string }} DocTopic
 * @typedef {{ slug: string, icon: string, title: string, summary: string,
 *             topics?: DocTopic[], desktopOnly?: boolean }} DocSection
 * @typedef {{ label: string, sections: DocSection[] }} DocGroup
 */

/**
 * Esquema comun mientras no se redacte el contenido definitivo. En cuanto una
 * seccion tiene su .md, los temas reales se derivan de sus encabezados y este
 * esquema deja de usarse.
 */
const DEFAULT_TOPICS = [
	{ id: 'vista-general', title: 'Vista general' },
	{ id: 'acciones', title: 'Acciones disponibles' },
	{ id: 'campos', title: 'Campos y validaciones' },
	{ id: 'flujo', title: 'Impacto en el flujo de trabajo' }
];

/** @type {DocGroup[]} */
const groups = [
	{
		label: 'Introducción',
		sections: [
			{
				slug: 'introduccion',
				icon: '📘',
				title: 'Introducción',
				summary: 'Qué es ESR Cloud, a quién está dirigido y cómo usar este manual.'
			},
			{
				slug: 'primeros-pasos',
				icon: '🚀',
				title: 'Primeros pasos',
				summary: 'Inicio de sesión, empresa activa y recorrido por la interfaz.'
			}
		]
	},
	{
		label: 'Comercial',
		sections: [
			{
				slug: 'cotizaciones',
				icon: ICONS.quotes,
				title: 'Cotizaciones',
				summary: 'Preparar una cotización, aprobarla y convertirla en orden de trabajo.'
			},
			{
				slug: 'ordenes',
				icon: ICONS.workOrders,
				title: 'Órdenes de Trabajo',
				summary: 'Estados de una orden, preparación, entrega, devolución y cierre.'
			}
		]
	},
	{
		label: 'Logística',
		sections: [
			{
				slug: 'conduces',
				icon: ICONS.conduces,
				title: 'Conduces',
				summary: 'Notas de entrega y devolución, numeración y checklists.'
			},
			{
				slug: 'incidencias',
				icon: ICONS.incidents,
				title: 'Incidencias',
				summary: 'Registrar daños, faltantes y notas operativas, y resolverlos.'
			}
		]
	},
	{
		label: 'Cobro',
		sections: [
			{
				slug: 'facturas',
				icon: ICONS.invoices,
				title: 'Facturas',
				summary: 'Emitir la factura de una o varias entregas, cobrarla y anularla.'
			}
		]
	},
	{
		label: 'Operación',
		sections: [
			{
				slug: 'eventos',
				icon: ICONS.events,
				title: 'Eventos',
				summary: 'Alta de eventos, fechas, cliente asociado y cotizaciones ligadas.'
			},
			{
				slug: 'clientes',
				icon: ICONS.customers,
				title: 'Clientes',
				summary: 'Directorio de clientes de la empresa activa y sus datos de contacto.'
			},
			{
				slug: 'inventario',
				icon: ICONS.inventory,
				title: 'Inventario',
				summary: 'Artículos, categorías, cantidades y disponibilidad comprometida.'
			}
		]
	},
	{
		label: 'Análisis',
		sections: [
			{
				slug: 'reportes',
				icon: ICONS.reports,
				title: 'Reportes',
				summary: 'Reportes operativos, documentos imprimibles y exportación a CSV.'
			},
			{
				slug: 'auditoria',
				icon: ICONS.audit,
				title: 'Auditoría',
				summary: 'Registro de acciones críticas: qué se guarda y cómo se consulta.'
			}
		]
	},
	{
		label: 'Administración',
		sections: [
			{
				slug: 'configuracion',
				icon: ICONS.settings,
				title: 'Configuración',
				summary: 'Datos de la empresa, apariencia y preferencias de la aplicación.'
			},
			{
				slug: 'roles-y-permisos',
				icon: '🔐',
				title: 'Roles y Permisos',
				summary: 'Qué puede hacer cada rol y cómo se gestionan los miembros.'
			},
			{
				slug: 'multiempresa',
				icon: '🏢',
				title: 'Multiempresa',
				summary: 'Cómo se aísla la información entre empresas y cómo se cambia de una a otra.'
			}
		]
	}
];

/** Grupos con los temas ya resueltos, tal como los consume la interfaz. */
export const docsGroups = groups.map((group) => ({
	...group,
	sections: group.sections.map((section) => ({
		...section,
		topics: section.topics || DEFAULT_TOPICS
	}))
}));

/** Lista plana en el mismo orden del indice, para portada y anterior/siguiente. */
export const docsSections = docsGroups.flatMap((group) =>
	group.sections.map((section) => ({ ...section, group: group.label }))
);

/**
 * @param {string} slug
 * @returns {object|null} la seccion con ese slug, o null si no existe.
 */
export function getSection(slug) {
	return docsSections.find((section) => section.slug === slug) || null;
}

/**
 * Seccion anterior y siguiente segun el orden del indice.
 * @param {string} slug
 */
export function getSiblings(slug) {
	const index = docsSections.findIndex((section) => section.slug === slug);
	if (index === -1) return { previous: null, next: null };
	return {
		previous: docsSections[index - 1] || null,
		next: docsSections[index + 1] || null
	};
}
