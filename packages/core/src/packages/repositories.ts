import type { ESRId } from '@esr/schemas';
import type { CatalogListOptions } from '../catalogs/repositories';
import type { RepositoryContext } from '../shared/tenant';

export type PackageItem = {
	item_id: ESRId;
	quantity: number;
	// Campos del articulo que el repositorio resuelve al listar, para que la
	// pantalla y la explosion en cotizacion no tengan que volver a pedirlos.
	name?: string;
	internal_code?: string;
	available_quantity?: number;
	/** Precio VIGENTE del articulo. Es el que se usa al explotar el paquete. */
	rental_price?: number | string;
	item_type?: string;
	item_is_active?: number;
};

export type PackageDraft = {
	id?: ESRId | null;
	name: string;
	description?: string;
	suggested_price?: number;
	notes?: string;
	items?: PackageItem[];
};

export interface PackageRepository {
	findById(id: ESRId): Promise<PackageDraft | null>;
	create(data: PackageDraft): Promise<PackageDraft>;
	update(id: ESRId, data: PackageDraft): Promise<PackageDraft>;
	replaceItems(packageId: ESRId, items: PackageItem[]): Promise<void>;
}

export type TenantPackageDraft = Omit<PackageDraft, 'id'> & { id?: ESRId | null; is_active?: number };

/**
 * Un paquete agrupa articulos que se alquilan juntos. Su razon de ser es
 * poder cotizarlos de una vez: al insertarlo en una cotizacion se explota en
 * sus lineas, cada una con el precio vigente del articulo.
 *
 * `suggested_price` es orientativo y NO se usa al explotar: el importe real
 * sale de los articulos, para que un cambio de tarifa no quede congelado en un
 * paquete definido hace meses.
 */
export interface TenantPackageRepository {
	list(ctx: RepositoryContext, options?: CatalogListOptions): Promise<PackageDraft[]>;
	findById(ctx: RepositoryContext, id: ESRId): Promise<PackageDraft | null>;
	findByName(ctx: RepositoryContext, name: string): Promise<PackageDraft | null>;
	listItems(ctx: RepositoryContext, packageId: ESRId): Promise<PackageItem[]>;
	create(ctx: RepositoryContext, data: TenantPackageDraft): Promise<PackageDraft>;
	update(ctx: RepositoryContext, id: ESRId, data: TenantPackageDraft): Promise<PackageDraft>;
	replaceItems(ctx: RepositoryContext, packageId: ESRId, items: PackageItem[]): Promise<void>;
	setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void>;
}
