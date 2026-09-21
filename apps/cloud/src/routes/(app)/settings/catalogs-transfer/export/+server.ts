import { todayISO, SELECTABLE_STATES } from '@esr/core';
import type { RequestHandler } from './$types';
import { requirePermission } from '$lib/server/permissions';
import {
	getCategoryRepository,
	getCommercialSectorRepository,
	getEventTypeRepository,
	getSubcategoryRepository,
	getUnitOfMeasureRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

const ALL_ENTITIES = ['event_types', 'units_of_measure', 'categories', 'subcategories', 'commercial_sectors'];

/**
 * Descarga el archivo `catalogos-esr-YYYY-MM-DD.json` con los catalogos
 * elegidos. Es una descarga GET normal -sin `use:enhance` ni JS extra en el
 * cliente-, igual que `/reports/orders.csv`.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const ctx = toTenantContext(companyId);

	// El formulario GET manda una casilla marcada por parametro repetido
	// (`?entities=a&entities=b`), no una lista unida por comas -pero se acepta
	// tambien esa forma, por si alguien arma la URL a mano-. Sin parametro, o
	// vacio del todo, se exportan los cinco: es una herramienta interna de bajo
	// riesgo, no hace falta ser estricto con la entrada.
	const pedido = url.searchParams.getAll('entities');
	const entidades = pedido.length
		? pedido.flatMap((e) => e.split(',')).map((e) => e.trim()).filter(Boolean)
		: ALL_ENTITIES;

	const catalogos: Record<string, unknown> = {};

	if (entidades.includes('event_types')) {
		const filas = await getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES });
		catalogos.event_types = filas.map((f) => ({
			name: f.name,
			color: f.color,
			description: f.description ?? null,
			is_active: f.is_active
		}));
	}

	if (entidades.includes('units_of_measure')) {
		const filas = await getUnitOfMeasureRepository().list(ctx, { state: SELECTABLE_STATES });
		catalogos.units_of_measure = filas.map((f) => ({
			name: f.name,
			abbr: f.abbr ?? null,
			is_active: f.is_active
		}));
	}

	if (entidades.includes('categories')) {
		const filas = await getCategoryRepository().list(ctx, { state: SELECTABLE_STATES });
		catalogos.categories = filas.map((f) => ({
			name: f.name,
			color: f.color,
			is_active: f.is_active
		}));
	}

	if (entidades.includes('subcategories')) {
		const [filas, categorias] = await Promise.all([
			getSubcategoryRepository().list(ctx, undefined, { state: SELECTABLE_STATES }),
			getCategoryRepository().list(ctx, { state: SELECTABLE_STATES })
		]);
		const nombrePorId = new Map(categorias.map((c) => [String(c.id), c.name]));
		catalogos.subcategories = filas
			.map((f) => {
				const category_name = nombrePorId.get(String(f.category_id));
				// No deberia pasar -toda subcategoria tiene su categoria-, pero se
				// omite en vez de exportar una fila sin como resolverla despues.
				if (!category_name) return null;
				return { name: f.name, category_name, is_active: f.is_active };
			})
			.filter((f): f is { name: string; category_name: string; is_active: number } => f !== null);
	}

	if (entidades.includes('commercial_sectors')) {
		const filas = await getCommercialSectorRepository().list(ctx, { state: SELECTABLE_STATES });
		catalogos.commercial_sectors = filas.map((f) => ({
			name: f.name,
			description: f.description ?? null,
			is_active: f.is_active
		}));
	}

	const payload = {
		tipo: 'esr-catalogos',
		version: 1,
		generado_en: new Date().toISOString(),
		origen: 'ESR Cloud',
		catalogos
	};

	return new Response(JSON.stringify(payload, null, 2), {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="catalogos-esr-${todayISO()}.json"`
		}
	});
};
