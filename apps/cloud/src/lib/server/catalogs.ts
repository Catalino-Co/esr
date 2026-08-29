import { RECORD_STATE } from '@esr/core';
import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { CatalogListOptions, RepositoryContext } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import { recordAuditLog } from './audit';
import { toTenantContext } from './tenant';

/**
 * Los cuatro catalogos de configuracion (tipos de evento, categorias,
 * proveedores y colaboradores) repiten la misma logica: validar el nombre,
 * rechazar duplicados dentro de la empresa, guardar y auditar. Vive aqui una
 * sola vez para que las paginas solo declaren sus campos.
 */

export type CatalogRepo<TDraft> = {
	list(ctx: RepositoryContext, options?: CatalogListOptions): Promise<TDraft[]>;
	findById(ctx: RepositoryContext, id: ESRId): Promise<TDraft | null>;
	findByName(ctx: RepositoryContext, name: string): Promise<TDraft | null>;
	create(ctx: RepositoryContext, data: never): Promise<TDraft>;
	update(ctx: RepositoryContext, id: ESRId, data: never): Promise<TDraft>;
	setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void>;
	countUsages(ctx: RepositoryContext, id: ESRId): Promise<number>;
};

export type CatalogAuditNames = {
	/** Prefijo de la accion auditada, por ejemplo `settings.event_type`. */
	action: string;
	/** Tipo de entidad en el registro de auditoria. */
	entity: string;
	/** Como se nombra en los mensajes al usuario, en singular. */
	label: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lee un campo de texto del formulario, ya recortado. */
export function text(form: FormData, field: string): string {
	return String(form.get(field) ?? '').trim();
}

/** Igual, pero devuelve null cuando viene vacio, para columnas opcionales. */
export function optionalText(form: FormData, field: string): string | null {
	return text(form, field) || null;
}

export function isValidEmail(value: string | null): boolean {
	return !value || EMAIL_PATTERN.test(value);
}

type SaveArgs<TDraft> = {
	event: Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>;
	companyId: string;
	repo: CatalogRepo<TDraft>;
	names: CatalogAuditNames;
	/** Campos ya leidos del formulario; `name` es obligatorio. */
	values: Record<string, unknown> & { name: string };
	/** Presente en la edicion, ausente en el alta. */
	id?: string;
};

/**
 * Alta o edicion de una entrada de catalogo.
 *
 * El chequeo de duplicado se hace antes de tocar la base para poder dar un
 * mensaje claro. No sustituye al indice unico de PostgreSQL, que es la barrera
 * real: entre la consulta y el INSERT cabe una escritura concurrente.
 */
export async function saveCatalogEntry<TDraft extends { id?: ESRId | null; name: string }>({
	event,
	companyId,
	repo,
	names,
	values,
	id
}: SaveArgs<TDraft>) {
	if (!values.name) {
		return fail(400, { error: 'El nombre es obligatorio.', values, editingId: id });
	}

	const ctx = toTenantContext(companyId);
	const duplicate = await repo.findByName(ctx, values.name);
	if (duplicate && String(duplicate.id) !== String(id ?? '')) {
		return fail(400, { error: `Ya existe «${values.name}» en esta empresa.`, values, editingId: id });
	}

	const saved = id
		? await repo.update(ctx, id, values as never)
		: await repo.create(ctx, values as never);

	await recordAuditLog(event, {
		action: id ? `${names.action}.updated` : `${names.action}.created`,
		entity_type: names.entity,
		entity_id: String(saved.id),
		description: `${names.label} ${id ? 'actualizado' : 'creado'}: ${saved.name}`
	});

	return {
		success: `«${saved.name}» ${id ? 'se actualizó' : 'se creó'} correctamente.`
	};
}

/**
 * Activa o desactiva una entrada. Nunca se borra: hay registros historicos que
 * apuntan a estas filas por id.
 */
export async function toggleCatalogEntry<TDraft extends { id?: ESRId | null; name: string }>({
	event,
	companyId,
	repo,
	names,
	id,
	isActive
}: {
	event: Pick<RequestEvent, 'locals' | 'request' | 'getClientAddress'>;
	companyId: string;
	repo: CatalogRepo<TDraft>;
	names: CatalogAuditNames;
	id: string;
	isActive: number;
}) {
	const ctx = toTenantContext(companyId);
	const entry = await repo.findById(ctx, id);
	if (!entry) return fail(404, { error: `${names.label} no encontrado.` });

	await repo.setActive(ctx, id, isActive);

	// Comparacion explicita: el inactivo es `2`, que como booleano es cierto.
	const activated = isActive === RECORD_STATE.ACTIVE;

	await recordAuditLog(event, {
		action: activated ? `${names.action}.reactivated` : `${names.action}.deactivated`,
		entity_type: names.entity,
		entity_id: String(id),
		description: `${names.label} ${activated ? 'reactivado' : 'desactivado'}: ${entry.name}`
	});

	return {
		success: `«${entry.name}» ${activated ? 'se reactivó' : 'se desactivó'}.`
	};
}
