import type {
	CatalogListOptions,
	ItemSerial,
	ItemSerialStatus,
	ItemSerialView,
	PackageDraft,
	PackageItem,
	RepositoryContext,
	SerialListFilters,
	TenantPackageDraft,
	TenantPackageRepository,
	TenantSerialRepository
} from '@esr/core';
import { DEFAULT_RECORD_STATE, requireCompanyId } from '@esr/core';
import type { ESRId } from '@esr/schemas';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { availabilityColumnsSql, AVAILABILITY_ORDER_STATUSES } from './availability';

/** Una linea de paquete tal como la pinta la vista previa del dialogo. */
export type PackagePreviewLine = {
	package_id: ESRId;
	item_id: ESRId;
	quantity: number;
	name: string;
	internal_code: string | null;
	/** `NUMERIC` de PostgreSQL: llega como CADENA, no como numero. */
	rental_price: string;
	is_active: number;
};

export class PostgresPackageRepository implements TenantPackageRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	private db(client?: pg.PoolClient) {
		return client ?? this.pool;
	}

	async list(ctx: RepositoryContext, options: CatalogListOptions = {}): Promise<PackageDraft[]> {
		const state = options.state ?? DEFAULT_RECORD_STATE;

		// El conteo de lineas se resuelve aqui para no tener que pedir los items
		// de cada paquete solo para pintar el listado.
		const result = await this.pool.query<PackageDraft & { item_count: number }>(
			`SELECT p.id, p.company_id, p.name, p.description, p.suggested_price::text AS suggested_price,
				p.notes, p.is_active,
				(SELECT COUNT(*)::int FROM package_items pi
				 WHERE pi.company_id = p.company_id AND pi.package_id = p.id) AS item_count
			 FROM packages p
			 WHERE p.company_id = $1 AND p.is_active = $2
			 ORDER BY p.name`,
			[requireCompanyId(ctx), state]
		);
		return result.rows;
	}

	async findById(ctx: RepositoryContext, id: ESRId): Promise<PackageDraft | null> {
		const result = await this.pool.query<PackageDraft>(
			`SELECT id, company_id, name, description, suggested_price::text AS suggested_price,
				notes, is_active
			 FROM packages WHERE company_id = $1 AND id = $2`,
			[requireCompanyId(ctx), id]
		);
		return result.rows[0] ?? null;
	}

	/** Normaliza igual que el indice unico de la migracion 009. */
	async findByName(ctx: RepositoryContext, name: string): Promise<PackageDraft | null> {
		const result = await this.pool.query<PackageDraft>(
			`SELECT id, company_id, name, description, suggested_price::text AS suggested_price,
				notes, is_active
			 FROM packages
			 WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
			[requireCompanyId(ctx), name]
		);
		return result.rows[0] ?? null;
	}

	/**
	 * Las lineas llegan con el nombre, el codigo, el precio vigente y la
	 * disponibilidad actual del articulo: eso es lo que necesita tanto la
	 * pantalla del paquete como la explosion en una cotizacion.
	 */
	async listItems(ctx: RepositoryContext, packageId: ESRId): Promise<PackageItem[]> {
		const result = await this.pool.query<PackageItem>(
			`SELECT pi.item_id, pi.quantity,
				i.name, i.internal_code,
				${availabilityColumnsSql(3)},
				i.rental_price::text AS rental_price,
				i.item_type, i.is_active AS item_is_active
			 FROM package_items pi
			 INNER JOIN items i ON i.id = pi.item_id AND i.company_id = pi.company_id
			 WHERE pi.company_id = $1 AND pi.package_id = $2
			 ORDER BY i.name`,
			[requireCompanyId(ctx), packageId, AVAILABILITY_ORDER_STATUSES]
		);
		return result.rows;
	}

	/**
	 * Lineas de TODOS los paquetes en UNA consulta.
	 *
	 * Alimenta la vista previa del dialogo «Agregar paquete». Pedirlas con
	 * `listItems` paquete a paquete seria una consulta por paquete en cada
	 * carga de la ficha —N+1— y ademas `listItems` calcula disponibilidad con
	 * una subconsulta correlacionada por linea, que la previa no pinta. Las
	 * filas totales de `package_items` de una empresa son decenas, no miles.
	 *
	 * `i.is_active` viaja a proposito: `addItem` exige `is_active = 1` y LANZA
	 * si no lo encuentra, asi que un paquete con un articulo dado de baja
	 * revienta a mitad de la insercion y deja la cotizacion con las lineas
	 * anteriores ya metidas. La previa lo enseña antes de que ocurra.
	 */
	async listAllItems(ctx: RepositoryContext): Promise<PackagePreviewLine[]> {
		const result = await this.pool.query<PackagePreviewLine>(
			`SELECT pi.package_id, pi.item_id, pi.quantity,
				i.name, i.internal_code,
				i.rental_price::text AS rental_price,
				i.is_active
			 FROM package_items pi
			 INNER JOIN items i ON i.id = pi.item_id AND i.company_id = pi.company_id
			 WHERE pi.company_id = $1
			 ORDER BY pi.package_id, i.name`,
			[requireCompanyId(ctx)]
		);
		return result.rows;
	}

	async create(ctx: RepositoryContext, data: TenantPackageDraft): Promise<PackageDraft> {
		const result = await this.pool.query<PackageDraft>(
			`INSERT INTO packages (company_id, name, description, suggested_price, notes, is_active)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING id, company_id, name, description, suggested_price::text AS suggested_price,
				notes, is_active`,
			[
				requireCompanyId(ctx),
				data.name.trim(),
				data.description ?? null,
				data.suggested_price ?? 0,
				data.notes ?? null,
				data.is_active ?? 1
			]
		);
		return result.rows[0];
	}

	async update(ctx: RepositoryContext, id: ESRId, data: TenantPackageDraft): Promise<PackageDraft> {
		const result = await this.pool.query<PackageDraft>(
			`UPDATE packages
			 SET name = $3, description = $4, suggested_price = $5, notes = $6
			 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, name, description, suggested_price::text AS suggested_price,
				notes, is_active`,
			[
				requireCompanyId(ctx),
				id,
				data.name.trim(),
				data.description ?? null,
				data.suggested_price ?? 0,
				data.notes ?? null
			]
		);
		if (!result.rows[0]) throw new Error(`Paquete ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	/** Se reemplaza el contenido entero en una transaccion: es un solo edit. */
	async replaceItems(ctx: RepositoryContext, packageId: ESRId, items: PackageItem[]): Promise<void> {
		const companyId = requireCompanyId(ctx);
		const client = await this.pool.connect();
		try {
			await client.query('BEGIN');
			await client.query('DELETE FROM package_items WHERE company_id = $1 AND package_id = $2', [
				companyId,
				packageId
			]);
			for (const item of items) {
				await client.query(
					`INSERT INTO package_items (company_id, package_id, item_id, quantity)
					 VALUES ($1, $2, $3, $4)`,
					[companyId, packageId, item.item_id, Math.max(1, Number(item.quantity) || 1)]
				);
			}
			await client.query('COMMIT');
		} catch (error) {
			await client.query('ROLLBACK');
			throw error;
		} finally {
			client.release();
		}
	}

	async setActive(ctx: RepositoryContext, id: ESRId, isActive: number): Promise<void> {
		await this.pool.query('UPDATE packages SET is_active = $3 WHERE company_id = $1 AND id = $2', [
			requireCompanyId(ctx),
			id,
			isActive
		]);
	}
}

const SERIAL_COLUMNS = 's.id, s.company_id, s.item_id, s.serial_number, s.status';

export class PostgresSerialRepository implements TenantSerialRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async list(ctx: RepositoryContext, filters: SerialListFilters = {}): Promise<ItemSerialView[]> {
		const params: unknown[] = [requireCompanyId(ctx)];
		const where = ['s.company_id = $1'];

		if (filters.item_id) {
			params.push(filters.item_id);
			where.push(`s.item_id = $${params.length}`);
		}
		if (filters.status) {
			params.push(filters.status);
			where.push(`s.status = $${params.length}`);
		}

		const result = await this.pool.query<ItemSerialView>(
			`SELECT ${SERIAL_COLUMNS}, i.name AS item_name,
				(SELECT wois.work_order_id FROM work_order_item_serials wois
				 WHERE wois.serial_id = s.id ORDER BY wois.id DESC LIMIT 1) AS work_order_id
			 FROM item_serials s
			 INNER JOIN items i ON i.id = s.item_id AND i.company_id = s.company_id
			 WHERE ${where.join(' AND ')}
			 ORDER BY i.name, s.serial_number`,
			params
		);
		return result.rows;
	}

	async findByItem(ctx: RepositoryContext, itemId: ESRId): Promise<ItemSerialView[]> {
		return this.list(ctx, { item_id: itemId });
	}

	async listAvailableForItem(ctx: RepositoryContext, itemId: ESRId): Promise<ItemSerialView[]> {
		return this.list(ctx, { item_id: itemId, status: 'disponible' });
	}

	async findBySerialNumber(
		ctx: RepositoryContext,
		itemId: ESRId,
		serialNumber: string
	): Promise<ItemSerial | null> {
		const result = await this.pool.query<ItemSerial>(
			`SELECT ${SERIAL_COLUMNS} FROM item_serials s
			 WHERE s.company_id = $1 AND s.item_id = $2
			   AND UPPER(TRIM(s.serial_number)) = UPPER(TRIM($3))`,
			[requireCompanyId(ctx), itemId, serialNumber]
		);
		return result.rows[0] ?? null;
	}

	async create(ctx: RepositoryContext, itemId: ESRId, serialNumber: string): Promise<ItemSerial> {
		const result = await this.pool.query<ItemSerial>(
			`INSERT INTO item_serials (company_id, item_id, serial_number, status)
			 VALUES ($1, $2, $3, 'disponible')
			 RETURNING id, company_id, item_id, serial_number, status`,
			[requireCompanyId(ctx), itemId, serialNumber.trim()]
		);
		return result.rows[0];
	}

	async setStatus(
		ctx: RepositoryContext,
		id: ESRId,
		status: ItemSerialStatus
	): Promise<ItemSerial> {
		const result = await this.pool.query<ItemSerial>(
			`UPDATE item_serials SET status = $3 WHERE company_id = $1 AND id = $2
			 RETURNING id, company_id, item_id, serial_number, status`,
			[requireCompanyId(ctx), id, status]
		);
		if (!result.rows[0]) throw new Error(`Serial ${id} no existe en esta empresa.`);
		return result.rows[0];
	}

	async countByStatus(
		ctx: RepositoryContext,
		itemId: ESRId,
		status: ItemSerialStatus
	): Promise<number> {
		const result = await this.pool.query<{ total: string }>(
			`SELECT COUNT(*)::text AS total FROM item_serials
			 WHERE company_id = $1 AND item_id = $2 AND status = $3`,
			[requireCompanyId(ctx), itemId, status]
		);
		return Number(result.rows[0]?.total ?? 0);
	}

	async listByWorkOrder(ctx: RepositoryContext, workOrderId: ESRId): Promise<ItemSerialView[]> {
		const result = await this.pool.query<ItemSerialView>(
			`SELECT ${SERIAL_COLUMNS}, i.name AS item_name, wois.work_order_id
			 FROM work_order_item_serials wois
			 INNER JOIN item_serials s ON s.id = wois.serial_id
			 INNER JOIN items i ON i.id = s.item_id AND i.company_id = s.company_id
			 WHERE wois.company_id = $1 AND wois.work_order_id = $2
			 ORDER BY i.name, s.serial_number`,
			[requireCompanyId(ctx), workOrderId]
		);
		return result.rows;
	}
}
