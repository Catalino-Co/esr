import { fail } from '@sveltejs/kit';
import { SELECTABLE_STATES } from '@esr/core';
import type { RepositoryContext } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getCategoryRepository,
	getCommercialSectorRepository,
	getEventTypeRepository,
	getSubcategoryRepository,
	getUnitOfMeasureRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Configuración › Exportar / Importar catálogos.
 *
 * Lleva tipos de evento, unidades de medida, categorías, subcategorías y
 * sectores comerciales de una instalación a otra -tipicamente de Desktop a
 * Cloud o al reves- via un archivo JSON. El mismo permiso de siempre,
 * `settings.catalogs.manage`, porque es el que ya protege las cinco pantallas
 * de catalogo que esta funcion combina.
 */

export type EntityImportResult = {
	agregados: number;
	omitidos: number;
	errores: string[];
};

const ENTITY_LABELS: Record<string, string> = {
	event_types: 'tipos de evento',
	units_of_measure: 'unidades de medida',
	categories: 'categorías',
	subcategories: 'subcategorías',
	commercial_sectors: 'sectores comerciales'
};

function nuevoResultado(): EntityImportResult {
	return { agregados: 0, omitidos: 0, errores: [] };
}

/** Normaliza igual que el indice unico de la base: minusculas y sin bordes. */
function normalizar(valor: unknown): string {
	return String(valor ?? '').trim();
}

type FilaCatalogo = Record<string, unknown>;

async function importarEventTypes(ctx: RepositoryContext, filas: FilaCatalogo[]): Promise<EntityImportResult> {
	const resultado = nuevoResultado();
	const repo = getEventTypeRepository();
	for (const fila of filas) {
		const name = normalizar(fila.name);
		if (!name) {
			resultado.errores.push('Fila sin nombre: se omitió.');
			continue;
		}
		try {
			const existente = await repo.findByName(ctx, name);
			if (existente) {
				resultado.omitidos++;
				continue;
			}
			await repo.create(ctx, {
				name,
				color: (fila.color as string) || '#6366f1',
				description: (fila.description as string | null) ?? null,
				is_active: Number(fila.is_active ?? 1)
			});
			resultado.agregados++;
		} catch (err) {
			resultado.errores.push(`«${name}»: ${err instanceof Error ? err.message : 'error desconocido'}.`);
		}
	}
	return resultado;
}

async function importarUnitsOfMeasure(ctx: RepositoryContext, filas: FilaCatalogo[]): Promise<EntityImportResult> {
	const resultado = nuevoResultado();
	const repo = getUnitOfMeasureRepository();
	for (const fila of filas) {
		const name = normalizar(fila.name);
		if (!name) {
			resultado.errores.push('Fila sin nombre: se omitió.');
			continue;
		}
		try {
			const existente = await repo.findByName(ctx, name);
			if (existente) {
				resultado.omitidos++;
				continue;
			}
			await repo.create(ctx, {
				name,
				abbr: (fila.abbr as string | null) ?? null,
				is_active: Number(fila.is_active ?? 1)
			});
			resultado.agregados++;
		} catch (err) {
			resultado.errores.push(`«${name}»: ${err instanceof Error ? err.message : 'error desconocido'}.`);
		}
	}
	return resultado;
}

async function importarCommercialSectors(ctx: RepositoryContext, filas: FilaCatalogo[]): Promise<EntityImportResult> {
	const resultado = nuevoResultado();
	const repo = getCommercialSectorRepository();
	for (const fila of filas) {
		const name = normalizar(fila.name);
		if (!name) {
			resultado.errores.push('Fila sin nombre: se omitió.');
			continue;
		}
		try {
			const existente = await repo.findByName(ctx, name);
			if (existente) {
				resultado.omitidos++;
				continue;
			}
			await repo.create(ctx, {
				name,
				description: (fila.description as string | null) ?? null,
				is_active: Number(fila.is_active ?? 1)
			});
			resultado.agregados++;
		} catch (err) {
			resultado.errores.push(`«${name}»: ${err instanceof Error ? err.message : 'error desconocido'}.`);
		}
	}
	return resultado;
}

/**
 * `categoriasNuevas` recibe cada categoria recien creada (nombre normalizado
 * -> id) para que, en el mismo request, la importacion de subcategorias las
 * vea sin tener que releer la base de datos.
 */
async function importarCategories(
	ctx: RepositoryContext,
	filas: FilaCatalogo[],
	categoriasNuevas: Map<string, string>
): Promise<EntityImportResult> {
	const resultado = nuevoResultado();
	const repo = getCategoryRepository();
	for (const fila of filas) {
		const name = normalizar(fila.name);
		if (!name) {
			resultado.errores.push('Fila sin nombre: se omitió.');
			continue;
		}
		try {
			const existente = await repo.findByName(ctx, name);
			if (existente) {
				resultado.omitidos++;
				continue;
			}
			const creada = await repo.create(ctx, {
				name,
				color: (fila.color as string) || '#3158c9',
				is_active: Number(fila.is_active ?? 1)
			});
			categoriasNuevas.set(name.toLowerCase(), String(creada.id));
			resultado.agregados++;
		} catch (err) {
			resultado.errores.push(`«${name}»: ${err instanceof Error ? err.message : 'error desconocido'}.`);
		}
	}
	return resultado;
}

/**
 * El mapa de categorias combina las YA existentes en este sistema con las que
 * el propio import acaba de crear -si "categorias" tambien venia elegido y se
 * proceso antes que esto, por eso el orden fijo en la accion-, porque una
 * subcategoria puede llegar en el mismo archivo que su categoria padre.
 */
async function importarSubcategories(
	ctx: RepositoryContext,
	filas: FilaCatalogo[],
	categoriasNuevas: Map<string, string>
): Promise<EntityImportResult> {
	const resultado = nuevoResultado();
	const repo = getSubcategoryRepository();

	const categoriasExistentes = await getCategoryRepository().list(ctx, { state: SELECTABLE_STATES });
	const mapaCategorias = new Map<string, string>(
		categoriasExistentes.map((c) => [String(c.name).trim().toLowerCase(), String(c.id)])
	);
	for (const [nombre, id] of categoriasNuevas) mapaCategorias.set(nombre, id);

	for (const fila of filas) {
		const name = normalizar(fila.name);
		const categoryName = normalizar(fila.category_name);
		if (!name || !categoryName) {
			resultado.errores.push('Fila sin nombre o sin categoría: se omitió.');
			continue;
		}
		const categoryId = mapaCategorias.get(categoryName.toLowerCase());
		if (!categoryId) {
			resultado.errores.push(
				`La categoría «${categoryName}» no existe: se omitió la subcategoría «${name}».`
			);
			continue;
		}
		try {
			const existente = await repo.findByName(ctx, categoryId, name);
			if (existente) {
				resultado.omitidos++;
				continue;
			}
			await repo.create(ctx, { category_id: categoryId, name, is_active: Number(fila.is_active ?? 1) });
			resultado.agregados++;
		} catch (err) {
			resultado.errores.push(`«${name}»: ${err instanceof Error ? err.message : 'error desconocido'}.`);
		}
	}
	return resultado;
}

export const load: PageServerLoad = async ({ locals }) => {
	const { companyId } = requirePermission(locals, 'settings.catalogs.manage');
	const ctx = toTenantContext(companyId);

	const [eventTypes, unitsOfMeasure, categories, subcategories, commercialSectors] = await Promise.all([
		getEventTypeRepository().list(ctx, { state: SELECTABLE_STATES }),
		getUnitOfMeasureRepository().list(ctx, { state: SELECTABLE_STATES }),
		getCategoryRepository().list(ctx, { state: SELECTABLE_STATES }),
		getSubcategoryRepository().list(ctx, undefined, { state: SELECTABLE_STATES }),
		getCommercialSectorRepository().list(ctx, { state: SELECTABLE_STATES })
	]);

	return {
		counts: {
			event_types: eventTypes.length,
			units_of_measure: unitsOfMeasure.length,
			categories: categories.length,
			subcategories: subcategories.length,
			commercial_sectors: commercialSectors.length
		}
	};
};

export const actions: Actions = {
	import: async (event) => {
		const { companyId } = requirePermission(event.locals, 'settings.catalogs.manage');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const jsonTexto = String(form.get('json_data') ?? '');
		const entidadesElegidas = new Set(form.getAll('entities').map(String));

		let parsed: { tipo?: string; catalogos?: Record<string, unknown> } | null = null;
		try {
			parsed = JSON.parse(jsonTexto);
		} catch {
			return fail(400, { error: 'Archivo inválido: no se pudo leer como JSON.' });
		}
		if (!parsed || parsed.tipo !== 'esr-catalogos' || typeof parsed.catalogos !== 'object' || !parsed.catalogos) {
			return fail(400, { error: 'Archivo inválido: no es un archivo de catálogos de ESR.' });
		}

		const catalogos = parsed.catalogos as Record<string, unknown>;
		const resultado: Record<string, EntityImportResult> = {};
		const resumenPartes: string[] = [];
		const categoriasNuevas = new Map<string, string>();

		// Orden fijo: categorias antes que subcategorias, porque estas ultimas
		// resuelven su categoria padre por NOMBRE contra lo que ya exista -o se
		// acabe de crear- en este sistema.
		if (Array.isArray(catalogos.event_types) && entidadesElegidas.has('event_types')) {
			resultado.event_types = await importarEventTypes(ctx, catalogos.event_types as FilaCatalogo[]);
		}
		if (Array.isArray(catalogos.units_of_measure) && entidadesElegidas.has('units_of_measure')) {
			resultado.units_of_measure = await importarUnitsOfMeasure(ctx, catalogos.units_of_measure as FilaCatalogo[]);
		}
		if (Array.isArray(catalogos.commercial_sectors) && entidadesElegidas.has('commercial_sectors')) {
			resultado.commercial_sectors = await importarCommercialSectors(
				ctx,
				catalogos.commercial_sectors as FilaCatalogo[]
			);
		}
		if (Array.isArray(catalogos.categories) && entidadesElegidas.has('categories')) {
			resultado.categories = await importarCategories(ctx, catalogos.categories as FilaCatalogo[], categoriasNuevas);
		}
		if (Array.isArray(catalogos.subcategories) && entidadesElegidas.has('subcategories')) {
			resultado.subcategories = await importarSubcategories(
				ctx,
				catalogos.subcategories as FilaCatalogo[],
				categoriasNuevas
			);
		}

		if (Object.keys(resultado).length === 0) {
			return fail(400, { error: 'No se seleccionó ningún catálogo para importar.' });
		}

		for (const [clave, parte] of Object.entries(resultado)) {
			resumenPartes.push(`${ENTITY_LABELS[clave] ?? clave}: ${parte.agregados} agregado(s), ${parte.omitidos} omitido(s)`);
		}

		await recordAuditLog(event, {
			action: 'settings.catalogs.imported',
			entity_type: 'catalogs',
			entity_id: companyId,
			description: `Importación de catálogos: ${resumenPartes.join('; ')}.`
		});

		return { resultado };
	}
};
