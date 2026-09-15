import { fail } from '@sveltejs/kit';
import { parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import {
	getCategoryRepository,
	getInventoryRepository,
	getSubcategoryRepository,
	getSupplierRepository,
	getUnitOfMeasureRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';
import { firstFormError, formErrorsToObject, validateCloudInventoryInput } from '$lib/server/validators';

/**
 * Columnas ordenables de la tabla, y por qué campo del item YA ENRIQUECIDO
 * (con `category_name`/`subcategory_name`/`uom_abbr` ya resueltos) se ordena
 * cada una. Ordenar aquí, en memoria, y no en el `ORDER BY` de
 * `PostgresInventoryRepository.list()`: tres de estas siete columnas no son
 * columnas de `items` -son nombres resueltos con un mapa, DESPUES de traer
 * las filas-, y esta pantalla ya limita a 200 filas, así que no vale la pena
 * enseñarle a esa consulta un `ORDER BY` dinamico con joins a tres tablas
 * para una lista de este tamaño. `numeric: true` son las columnas donde el
 * campo es un numero (precio, estado) y hay que restar en vez de comparar
 * texto. Fuera de este mapa no hay «Acciones»: no hay nada que ordenar ahi.
 */
const SORT_FIELDS = {
	code: { field: 'internal_code', numeric: false },
	name: { field: 'name', numeric: false },
	category: { field: 'category_name', numeric: false },
	unit: { field: 'uom_abbr', numeric: false },
	subcategory: { field: 'subcategory_name', numeric: false },
	price: { field: 'rental_price', numeric: true },
	state: { field: 'is_active', numeric: true }
};

/** @param {string | null} value */
function parseSort(value) {
	return value && Object.hasOwn(SORT_FIELDS, value) ? value : 'name';
}

/**
 * El CATALOGO de artículos: qué existe, cómo se llama, quién lo suministra y en
 * qué estado de circulación está.
 *
 * Separado de Inventario, que responde a otra pregunta —cuánto hay y dónde—.
 * Aquí viven el alta, la baja y el archivado; allí no, porque activar o
 * archivar cosas no es algo que se haga mirando existencias.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'inventory.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;
	const categoryId = url.searchParams.get('category')?.trim() || undefined;
	const rawSubcategoryId = url.searchParams.get('subcategory')?.trim() || undefined;
	const state = parseRecordState(url.searchParams.get('state'));
	const sort = parseSort(url.searchParams.get('sort'));
	const dir = url.searchParams.get('dir') === 'desc' ? 'desc' : 'asc';

	const [categories, subcategories, suppliers, units] = await Promise.all([
		getCategoryRepository().list(ctx),
		// Sin `categoryId`: trae las de TODA la empresa de una vez, para que el
		// modal de alta filtre en el cliente segun la categoria elegida sin un
		// segundo viaje al servidor por cada cambio de select.
		getSubcategoryRepository().list(ctx),
		getSupplierRepository().list(ctx),
		getUnitOfMeasureRepository().list(ctx)
	]);

	/**
	 * Si la URL trae una categoria Y una subcategoria que no es SUYA -se llega
	 * ahi cambiando de categoria sin tocar el filtro de subcategoria, que el
	 * `<FilterBar>` deja intacto por diseño-, la subcategoria vieja se ignora
	 * en vez de filtrar a una lista garantizada vacia con el select mostrando
	 * "Cualquier subcategoría" como si no hubiera filtro.
	 */
	const subcategoryId =
		rawSubcategoryId && (!categoryId || subcategories.some(
			(s) => String(s.id) === rawSubcategoryId && String(s.category_id) === categoryId
		))
			? rawSubcategoryId
			: undefined;

	const items = await getInventoryRepository().list(ctx, {
		search,
		state,
		category_id: categoryId,
		subcategory_id: subcategoryId,
		limit: 200,
		offset: 0
	});

	const categoryMap = new Map(categories.map((c) => [String(c.id), c.name]));
	const subcategoryMap = new Map(subcategories.map((s) => [String(s.id), s.name]));
	const supplierMap = new Map(suppliers.map((s) => [String(s.id), s.name]));
	const unitMap = new Map(units.map((u) => [String(u.id), u.abbr || u.name]));

	const enriched = items.map((item) => ({
		...item,
		category_name: item.category_id ? categoryMap.get(String(item.category_id)) ?? '—' : '—',
		subcategory_name: item.subcategory_id ? subcategoryMap.get(String(item.subcategory_id)) ?? '—' : '—',
		supplier_name: item.supplier_id ? supplierMap.get(String(item.supplier_id)) ?? '—' : '—',
		uom_abbr: item.uom_id ? unitMap.get(String(item.uom_id)) ?? '' : ''
	}));

	const { field, numeric } = SORT_FIELDS[sort];
	const factor = dir === 'desc' ? -1 : 1;
	enriched.sort((a, b) => {
		const comparison = numeric
			? Number(a[field] ?? 0) - Number(b[field] ?? 0)
			: String(a[field] ?? '').localeCompare(String(b[field] ?? ''), 'es');
		return comparison * factor;
	});

	return {
		items: enriched,
		categories,
		subcategories,
		suppliers,
		units,
		search: search ?? '',
		state,
		categoryId: categoryId ?? '',
		subcategoryId: subcategoryId ?? '',
		sort,
		dir
	};
};

export const actions: Actions = {
	/**
	 * Alta de artículo desde el modal del listado.
	 *
	 * Vivía en `settings/articles/new/+page.server.ts`, una ruta propia que
	 * redirigía a la ficha al terminar. Aquí no se puede redirigir desde el
	 * servidor: el modal usa `use:enhance` con su propio callback, y es el
	 * cliente quien cierra el diálogo y navega tras el éxito.
	 */
	create: async ({ request, locals, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'inventory.create');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		// Sin cantidad inicial: un artículo NACE EN CERO y el stock entra por un
		// movimiento. El campo que había escribía cien sillas sin dejar rastro de
		// quién ni cuándo, y ese es justo el rastro que hace auditable un almacén.
		const values = {
			name: String(form.get('name') ?? '').trim(),
			internal_code: String(form.get('internal_code') ?? '').trim(),
			category_id: String(form.get('category_id') ?? '').trim(),
			subcategory_id: String(form.get('subcategory_id') ?? '').trim(),
			notes: String(form.get('notes') ?? '').trim(),
			rental_price: Number(form.get('rental_price') ?? 0),
			internal_cost: Number(form.get('internal_cost') ?? 0),
			supplier_id: String(form.get('supplier_id') ?? '').trim(),
			uom_id: String(form.get('uom_id') ?? '').trim(),
			// Un checkbox sin marcar no llega en el formulario: su ausencia ES el "no".
			tracks_inventory: form.get('tracks_inventory') === '1'
		};

		const errors = validateCloudInventoryInput(values);
		if (errors.length) {
			return fail(400, { error: firstFormError(errors), fieldErrors: formErrorsToObject(errors), values });
		}

		// Sin `description`: se eliminó del formulario por duplicar `notes` sin
		// ningún consumidor propio (ni cotización, ni PDF, ni buscador la leía).
		// La columna se queda intacta en la base; solo se deja de escribir.
		const item = await getInventoryRepository().create(ctx, {
			name: values.name,
			internal_code: values.internal_code || undefined,
			category_id: values.category_id || '',
			subcategory_id: values.subcategory_id || undefined,
			notes: values.notes || undefined,
			rental_price: values.rental_price,
			internal_cost: values.internal_cost,
			supplier_id: values.supplier_id || null,
			uom_id: values.uom_id || null,
			is_active: 1,
			tracks_inventory: values.tracks_inventory
		});

		// `items.supplier_id` es la instantánea que lee el listado; la ficha del
		// artículo (Proveedores) lee la tabla puente, que hasta ahora nadie
		// llenaba al crear: el proveedor elegido aquí se veía en la columna de
		// la lista pero no aparecía como principal al abrir la ficha.
		if (values.supplier_id) {
			await getInventoryRepository().addSupplier(ctx, item.id, values.supplier_id, true);
		}

		await recordAuditLog({ locals, request, getClientAddress }, {
			action: 'inventory.created',
			entity_type: 'inventory',
			entity_id: String(item.id),
			description: `Artículo creado: ${item.name}`
		});

		return { success: true, id: item.id };
	}
};
