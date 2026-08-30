import { RECORD_STATE, isRecordState } from '@esr/core';
import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { CatalogListOptions, RecordState, RepositoryContext } from '@esr/core';
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

/**
 * Estado de circulacion pedido por un formulario, o `null` si no es valido.
 *
 * No se usa `parseRecordState`: ese cae al ACTIVO por defecto, que es lo
 * correcto para un `?state=` de la URL —un filtro corrupto no debe vaciar la
 * lista— pero aqui seria activar un registro que nadie pidio activar.
 */
export function recordStateField(form: FormData, field = 'is_active'): RecordState | null {
	const raw = text(form, field);
	if (!raw) return null;
	const parsed = Number(raw);
	return isRecordState(parsed) ? parsed : null;
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

/** Como se nombra cada transito en la auditoria y en el mensaje al usuario. */
const STATE_VERBS: Record<RecordState, { action: string; participle: string; verb: string }> = {
	[RECORD_STATE.ACTIVE]: { action: 'reactivated', participle: 'reactivado', verb: 'se reactivó' },
	[RECORD_STATE.INACTIVE]: { action: 'deactivated', participle: 'desactivado', verb: 'se desactivó' },
	[RECORD_STATE.ARCHIVED]: { action: 'archived', participle: 'archivado', verb: 'se archivó' }
};

/**
 * Mueve una entrada entre los tres estados de circulacion. Nunca se borra: hay
 * registros historicos que apuntan a estas filas por id.
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
	isActive: RecordState;
}) {
	const ctx = toTenantContext(companyId);
	// Se busca sin filtro de estado: reactivar una entrada archivada exige
	// poder encontrarla, y `findById` no filtra por `is_active`.
	const entry = await repo.findById(ctx, id);
	if (!entry) return fail(404, { error: `${names.label} no encontrado.` });

	await repo.setActive(ctx, id, isActive);

	// Nada de ternarios sobre `isActive`: el inactivo es `2` y el archivado es
	// `0`, asi que como booleano dirian lo contrario de lo que pasa.
	const words = STATE_VERBS[isActive];

	await recordAuditLog(event, {
		action: `${names.action}.${words.action}`,
		entity_type: names.entity,
		entity_id: String(id),
		description: `${names.label} ${words.participle}: ${entry.name}`
	});

	return { success: `«${entry.name}» ${words.verb}.` };
}
