import type { ESRId } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

/**
 * Direcciones de SERVICIO de un cliente: a donde se entrega o se monta.
 *
 * No confundir con `clients.address`, que es la direccion FISCAL y sigue
 * viviendo en el propio cliente porque es la que sale en la factura.
 *
 * Herencia: `contact_person`, `phone` y `email` en `null` significan «hereda
 * del cliente», y se resuelven al leer. Guardar una copia del valor dejaria la
 * direccion congelada cuando cambie el del cliente —eso es «rellenar», no
 * «heredar»—. Consecuencia practica: NUNCA se escribe cadena vacia en esas tres
 * columnas, o se pierde la diferencia entre «heredo» y «no tiene».
 *
 * El celular no hereda: el cliente no tiene celular.
 */
export type ClientAddressDraft = {
	id?: ESRId | null;
	company_id?: string;
	client_id: ESRId;
	/** El «Detalle»: «Sucursal Herrera», «Plaza Internacional». */
	label: string;
	address_type_id?: ESRId | null;
	address: string;
	contact_person?: string | null;
	phone?: string | null;
	email?: string | null;
	mobile?: string | null;
	notes?: string | null;
	is_primary?: boolean;
	is_active?: number;
};

/** Fila leida: trae el nombre del tipo y los valores ya resueltos. */
export type ClientAddress = ClientAddressDraft & {
	id: ESRId;
	address_type_name?: string | null;
	/** El propio, o el del cliente cuando el propio es `null`. */
	effective_contact_person?: string | null;
	effective_phone?: string | null;
	effective_email?: string | null;
};

export type ClientAddressListOptions = {
	/** Estado de circulacion; sin valor, solo activas. */
	state?: RecordStateFilter;
};

export interface TenantClientAddressRepository {
	listByClient(
		ctx: RepositoryContext,
		clientId: ESRId,
		options?: ClientAddressListOptions
	): Promise<ClientAddress[]>;
	findById(ctx: RepositoryContext, id: ESRId): Promise<ClientAddress | null>;
	create(ctx: RepositoryContext, data: Omit<ClientAddressDraft, 'id' | 'company_id'>): Promise<ClientAddress>;
	update(
		ctx: RepositoryContext,
		id: ESRId,
		data: Omit<ClientAddressDraft, 'id' | 'company_id' | 'client_id'>
	): Promise<ClientAddress>;
	/** Nunca se borra: hay documentos que apuntaran a estas filas por id. */
	setState(ctx: RepositoryContext, id: ESRId, state: RecordState): Promise<void>;
	/**
	 * Marca UNA como principal y apaga el resto en la misma sentencia. Esa
	 * atomicidad es la que sustituye al indice unico, que aqui no se puede usar
	 * (ver el comentario de la migracion 016).
	 */
	setPrimary(ctx: RepositoryContext, clientId: ESRId, id: ESRId): Promise<void>;
}
