import { ICONS } from '@esr/ui/icons';

/**
 * Indice del manual de usuario de ESR Pro. Es la unica fuente de verdad del
 * esqueleto: el indice lateral, la portada, las rutas /docs/[slug], el TOC de
 * cada pagina y la navegacion anterior/siguiente se derivan de aqui.
 *
 * Para redactar una seccion se crea su archivo en lib/docs/content/<slug>.md y
 * sus temas pasan a salir de los encabezados de ese Markdown.
 */

/** Esquema comun mientras no se redacte el contenido definitivo. */
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
				summary: 'Qué es ESR Pro, a quién está dirigido y cómo usar este manual.'
			},
			{
				slug: 'primeros-pasos',
				icon: '🚀',
				title: 'Primeros pasos',
				summary: 'Inicio de sesión, recorrido por la interfaz y configuración inicial.'
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
				summary: 'Conduces de entrega y devolución, checklists de salida y retorno.'
			},
			{
				slug: 'facturas',
				icon: ICONS.invoices,
				title: 'Facturas y cobros',
				summary: 'Emitir la factura de una o varias entregas, cobrarla y anularla.'
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
				summary: 'Directorio de clientes y sus datos de contacto.'
			},
			{
				slug: 'inventario',
				icon: ICONS.inventory,
				title: 'Inventario',
				summary: 'Artículos, categorías, seriales y disponibilidad.'
			},
			{
				slug: 'paquetes',
				icon: ICONS.packages,
				title: 'Paquetes',
				summary: 'Agrupar artículos en paquetes reutilizables para cotizar más rápido.'
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
				summary: 'Reportes operativos y documentos imprimibles.'
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
				summary: 'Datos de la empresa, catálogos, apariencia y tema visual.'
			},
			{
				slug: 'usuarios',
				icon: '🔐',
				title: 'Usuarios',
				summary: 'Accesos locales, contraseñas y colaboradores del equipo.'
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

/** Lista plana en el mismo orden del indice. */
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
