import { fail, redirect } from '@sveltejs/kit';
import { parseRecordState } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { getPackageRepository } from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'packages.view');
	const state = parseRecordState(url.searchParams.get('state'));
	const search = url.searchParams.get('search')?.trim().toLowerCase() || '';

	const packages = await getPackageRepository().list(toTenantContext(companyId), { state });

	// El repositorio de paquetes no filtra por texto; con catalogos de este
	// tamaño no compensa una consulta nueva, se filtra en memoria.
	const filtered = search
		? packages.filter((pkg) => (pkg.name ?? '').toLowerCase().includes(search))
		: packages;

	return { packages: filtered, state, search: url.searchParams.get('search') ?? '' };
};

const MAX_LOTE = 100;

function leerIds(form: FormData): { ids: string[]; error?: string } {
	const crudos = form.getAll('ids').map((v) => String(v).trim()).filter(Boolean);
	if (!crudos.length) return { ids: [], error: 'No hay ningún paquete seleccionado.' };
	if (crudos.some((v) => !/^\d+$/.test(v))) {
		return { ids: [], error: 'La selección contiene identificadores no válidos.' };
	}
	const ids = [...new Set(crudos)];
	if (ids.length > MAX_LOTE) {
		return { ids: [], error: `No se pueden procesar más de ${MAX_LOTE} a la vez.` };
	}
	return { ids };
}

/**
 * Cambia el estado de circulación en bloque. Sin comprobación de
 * disponibilidad —a diferencia de aprobar una cotización—, solo «si ya está
 * en ese estado, se salta»: es la única guarda que tiene sentido aquí.
 */
async function cambiarEstadoMany(
	event: Parameters<Actions['create']>[0],
	targetState: number,
	etiquetaAccion: string
) {
	const { companyId } = requirePermission(event.locals, 'packages.archive');
	const ctx = toTenantContext(companyId);
	const { ids, error } = leerIds(await event.request.formData());
	if (error) return fail(400, { error });

	const hechas: string[] = [];
	const saltadas: string[] = [];

	for (const id of ids) {
		const pkg = await getPackageRepository().findById(ctx, id);
		if (!pkg) {
			saltadas.push(`#${id}: no encontrado`);
			continue;
		}
		if (pkg.is_active === targetState) {
			saltadas.push(`${pkg.name}: ya estaba en ese estado`);
			continue;
		}
		await getPackageRepository().setActive(ctx, id, targetState);
		hechas.push(pkg.name);
		await recordAuditLog(event, {
			action: `package.${etiquetaAccion}`,
			entity_type: 'package',
			entity_id: String(id),
			description: `Paquete ${etiquetaAccion}: ${pkg.name}`,
			metadata: { lote: ids.length }
		});
	}

	return { bulk: { accion: etiquetaAccion, hechas: hechas.length, saltadas } };
}

export const actions: Actions = {
	create: async (event) => {
		const { companyId } = requirePermission(event.locals, 'packages.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const name = String(form.get('name') ?? '').trim();
		// `values` viaja en todo `fail`: el dialogo se re-renderiza al recibir la
		// respuesta y sin esto se quedaria vacio.
		const values = {
			name,
			description: String(form.get('description') ?? '').trim(),
			suggested_price: String(form.get('suggested_price') ?? '')
		};
		if (!name) return fail(400, { error: 'El nombre del paquete es obligatorio.', values });

		const duplicate = await getPackageRepository().findByName(ctx, name);
		if (duplicate) {
			return fail(400, { error: `Ya existe el paquete «${name}» en esta empresa.`, values });
		}

		const created = await getPackageRepository().create(ctx, {
			name,
			description: String(form.get('description') ?? '').trim() || undefined,
			suggested_price: Number(form.get('suggested_price') ?? 0) || 0,
			is_active: 1
		});

		await recordAuditLog(event, {
			action: 'package.created',
			entity_type: 'package',
			entity_id: String(created.id),
			description: `Paquete creado: ${created.name} (${created.code})`
		});

		throw redirect(303, `/packages/${created.id}`);
	},

	activateMany: (event) => cambiarEstadoMany(event, 1, 'activado'),
	deactivateMany: (event) => cambiarEstadoMany(event, 2, 'inactivado'),
	archiveMany: (event) => cambiarEstadoMany(event, 0, 'archivado')
};
