import type {
	ClientAddress,
	ClientAddressDraft,
	ClientAddressListOptions,
	RecordState,
	RepositoryContext,
	TenantClientAddressRepository
} from '@esr/core';
import { requireCompanyId } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { appendStateFilter } from './state-filter';

/**
 * Direcciones de servicio de un cliente.
 *
 * Dos cosas que no se ven en el SQL y conviene no deshacer:
 *
 *  1. La herencia se resuelve al LEER, con `COALESCE`. En la tabla, `NULL`
 *     significa «hereda del cliente»; por eso los `?? null` de abajo nunca
 *     convierten a cadena vacia. Si alguien escribe `''`, esa direccion deja de
 *     heredar sin que nadie lo haya pedido, y ya no hay forma de distinguirlo.
 *  2. `setPrimary` es UNA sentencia. Ver el comentario de la migracion 016: un
 *     indice unico parcial sobre `is_primary` reventaria de forma intermitente,
 *     asi que la invariante la garantiza la atomicidad de este UPDATE.
 */
export class PostgresClientAddressRepository implements TenantClientAddressRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	/** Columnas leidas, con el tipo y los valores heredados ya resueltos. */
	private readonly selection = `
		a.id, a.company_id, a.client_id, a.label, a.address_type_id, a.address,
		a.contact_person, a.phone, a.email, a.mobile, a.notes,
		a.is_primary, a.is_active, a.created_at, a.updated_at,
		t.name AS address_type_name,
		COALESCE(a.contact_person, c.contact_person) AS effective_contact_person,
		COALESCE(a.phone, c.phone)                   AS effective_phone,
		COALESCE(a.email, c.email)                   AS effective_email`;

	private readonly joins = `
		FROM client_addresses a
		JOIN clients c ON c.id = a.client_id AND c.company_id = a.company_id
		LEFT JOIN client_address_types t ON t.id = a.address_type_id`;

	async listByClient(
		ctx: RepositoryContext,
		clientId: ESRId,
		options: ClientAddressListOptions = {}
	): Promise<ClientAddress[]> {
		const params: unknown[] = [requireCompanyId(ctx), clientId];
		const where = ['a.company_id = $1', 'a.client_id = $2'];
		appendStateFilter(params, where, options.state, 'a.');

		const result = await this.pool.query<ClientAddress>(
			`SELECT ${this.selection} ${this.joins}
			 WHERE ${where.join(' AND ')}
			 ORDER BY a.is_primary DESC, a.label`,
			params
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<ClientAddress | null> {
		const result = await this.pool.query<ClientAddress>(
			`SELECT ${this.selection} ${this.joins} WHERE a.company_id = $1 AND a.id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	async create(
		ctx: RepositoryContext,
		data: Omit<ClientAddressDraft, 'id' | 'company_id'>
	): Promise<ClientAddress> {
		const companyId = requireCompanyId(ctx);
		const inserted = await this.pool.query<{ id: ESRId }>(
			`INSERT INTO client_addresses
				(company_id, client_id, label, address_type_id, address,
				 contact_person, phone, email, mobile, notes, is_primary, is_active)
			 SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
			 -- El cliente se re-lee contra la empresa: sin esto, un id de otra
			 -- empresa colado en el formulario colgaria su direccion de un
			 -- cliente ajeno.
			 WHERE EXISTS (SELECT 1 FROM clients WHERE id = $2 AND company_id = $1)
			 RETURNING id`,
			[
				companyId,
				data.client_id,
				data.label.trim(),
				data.address_type_id || null,
				data.address.trim(),
				data.contact_person ?? null,
				data.phone ?? null,
				data.email ?? null,
				data.mobile ?? null,
				data.notes ?? null,
				data.is_primary ?? false,
				data.is_active ?? 1
			]
		);

		const id = inserted.rows[0]?.id;
		if (id === undefined) throw new Error(`El cliente ${data.client_id} no existe en esta empresa.`);
		if (data.is_primary) await this.setPrimary(ctx, data.client_id, id);

		const saved = await this.findById(ctx, id);
		if (!saved) throw new Error('La dirección se creó pero no se pudo leer.');
		return saved;
	}

	async update(
		ctx: RepositoryContext,
		id: ESRId,
		data: Omit<ClientAddressDraft, 'id' | 'company_id' | 'client_id'>
	): Promise<ClientAddress> {
		const result = await this.pool.query<{ client_id: ESRId }>(
			`UPDATE client_addresses SET
				label = $3, address_type_id = $4, address = $5,
				contact_person = $6, phone = $7, email = $8, mobile = $9, notes = $10,
				is_active = $11, updated_at = NOW()
			 WHERE company_id = $1 AND id = $2
			 RETURNING client_id`,
			[
				requireCompanyId(ctx),
				id,
				data.label.trim(),
				data.address_type_id || null,
				data.address.trim(),
				data.contact_person ?? null,
				data.phone ?? null,
				data.email ?? null,
				data.mobile ?? null,
				data.notes ?? null,
				data.is_active ?? 1
			]
		);

		const clientId = result.rows[0]?.client_id;
		if (clientId === undefined) throw new Error(`La dirección ${id} no existe en esta empresa.`);
		// `is_primary` no se toca aqui: apagar la anterior es cosa de
		// `setPrimary`, y mezclarlo haria que guardar una direccion cualquiera
		// pudiera desmarcar la principal sin querer.
		if (data.is_primary) await this.setPrimary(ctx, clientId, id);

		const saved = await this.findById(ctx, id);
		if (!saved) throw new Error('La dirección se actualizó pero no se pudo leer.');
		return saved;
	}

	async setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void> {
		// Una direccion archivada no puede seguir siendo la principal.
		await this.pool.query(
			`UPDATE client_addresses
			 SET is_active = $3,
			     is_primary = CASE WHEN $3 = 1 THEN is_primary ELSE FALSE END,
			     updated_at = NOW()
			 WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), id, state]
		);
	}

	async setPrimary(ctx: RepositoryContext, clientId: ESRId, id: ESRId): Promise<void> {
		// UNA sentencia, y por eso atomica. Ver la cabecera de la clase.
		await this.pool.query(
			`UPDATE client_addresses
			 SET is_primary = (id = $3), updated_at = NOW()
			 WHERE company_id = $1 AND client_id = $2`,
			[requireCompanyId(ctx), clientId, id]
		);
	}
}
