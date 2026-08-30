import type { ESRId } from '@esr/schemas';
import type { RecordState, RecordStateFilter } from '../shared/record-state';
import type { RepositoryContext } from '../shared/tenant';

/**
 * Catalogos de apoyo de una empresa: tipos de evento, proveedores y
 * colaboradores. Comparten forma —listar, crear, editar y activar/desactivar—
 * y ninguno se borra nunca: se desactivan, porque hay registros historicos
 * (eventos, ordenes) que los referencian por id.
 */

export type CatalogListOptions = {
	/**
	 * Estado de circulacion a listar. Sin valor se devuelven los activos.
	 *
	 * Sustituye al antiguo `includeInactive?: boolean`, que no podia expresar
	 * tres estados: un booleano solo distingue "activos" de "todos".
	 */
	state?: RecordStateFilter;
};

export type EventTypeDraft = {
	id?: ESRId | null;
	company_id?: string;
	name: string;
	color?: string;
	description?: string | null;
	is_active?: number;
};

export type SupplierDraft = {
	id?: ESRId | null;
	company_id?: string;
	name: string;
	contact?: string | null;
	phone?: string | null;
	email?: string | null;
	service?: string | null;
	notes?: string | null;
	is_active?: number;
};

export type CollaboratorDraft = {
	id?: ESRId | null;
	company_id?: string;
	name: string;
	phone?: string | null;
	email?: string | null;
	role?: string | null;
	notes?: string | null;
	is_active?: number;
};

/**
 * Sector comercial del cliente: Eventos, Hoteles, Retail... Es lo unico de los
 * tres campos comerciales nuevos que SI es catalogo: cambia por empresa y por
 * negocio, al reves que el tipo de documento o la condicion de pago, que son
 * fiscales y de pais.
 */
export type CommercialSectorDraft = {
	id?: ESRId | null;
	company_id?: string;
	name: string;
	description?: string | null;
	is_active?: number;
};

/** Tipo de una direccion de servicio: Sucursal, Almacen, Obra... */
export type ClientAddressTypeDraft = {
	id?: ESRId | null;
	company_id?: string;
	name: string;
	description?: string | null;
	is_active?: number;
};

/** Contrato comun de un catalogo simple con alcance de empresa. */
export interface TenantCatalogRepository<TDraft> {
	list(ctx: RepositoryContext, options?: CatalogListOptions): Promise<TDraft[]>;
	findById(ctx: RepositoryContext, id: ESRId): Promise<TDraft | null>;
	/** Busca por nombre normalizado para poder avisar del duplicado antes de
	 *  chocar contra el indice unico de PostgreSQL. */
	findByName(ctx: RepositoryContext, name: string): Promise<TDraft | null>;
	create(ctx: RepositoryContext, data: Omit<TDraft, 'id' | 'company_id'>): Promise<TDraft>;
	update(
		ctx: RepositoryContext,
		id: ESRId,
		data: Omit<TDraft, 'id' | 'company_id'>
	): Promise<TDraft>;
	setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void>;
	/** Cuantos registros operativos apuntan a esta entrada. Se usa para avisar
	 *  antes de desactivar algo que esta en uso. */
	countUsages(ctx: RepositoryContext, id: ESRId): Promise<number>;
}

export type TenantEventTypeRepository = TenantCatalogRepository<EventTypeDraft>;
export type TenantSupplierRepository = TenantCatalogRepository<SupplierDraft>;
export type TenantCollaboratorRepository = TenantCatalogRepository<CollaboratorDraft>;
export type TenantCommercialSectorRepository = TenantCatalogRepository<CommercialSectorDraft>;
export type TenantClientAddressTypeRepository = TenantCatalogRepository<ClientAddressTypeDraft>;
