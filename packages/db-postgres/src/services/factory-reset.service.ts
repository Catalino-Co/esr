import type { RepositoryContext } from '@esr/core';
import { requireCompanyId } from '@esr/core';
import { withTransaction } from '../transaction';

/**
 * Reinicio de fabrica: borra TODO lo operativo de una empresa, dejando
 * intactos `companies`, `company_info`, `units_of_measure`, `users` y
 * `company_members`.
 *
 * Ninguna de las tablas involucradas tiene `ON DELETE CASCADE` hacia las
 * demas -salvo un puñado ya cubierto explicitamente igual-, asi que hay que
 * borrar hijos antes que padres. El array de abajo ya viene en ese orden;
 * cambiar el orden sin releer las migraciones puede romper una llave
 * foranea a medio reinicio.
 *
 * `events.quotation_id`/`events.work_order_id` apuntan (sin validar, ver
 * migracion 001) de vuelta a `quotations`/`work_orders`, que a su vez
 * apuntan a `events`: una referencia circular real. Se rompe con un UPDATE
 * antes de borrar nada, no con un DELETE fuera de orden.
 */
const TABLES_IN_DELETE_ORDER = [
	'audit_logs',
	'conduce_item_serials',
	'work_order_item_serials',
	'invoice_items',
	'invoice_conduces',
	'payments',
	'work_order_checklists',
	'incidents',
	'conduce_items',
	'quotation_items',
	'work_order_items',
	'package_items',
	'item_suppliers',
	'item_stock',
	'item_serials',
	'item_inventory',
	'stock_movements',
	'invoices',
	'conduces',
	'work_orders',
	'quotations',
	'events',
	'client_addresses',
	'clients',
	'packages',
	'items',
	'subcategories',
	'categories',
	'warehouses',
	'suppliers',
	'event_types',
	'collaborators',
	'commercial_sectors',
	'client_address_types'
] as const;

export class FactoryResetService {
	async reset(ctx: RepositoryContext): Promise<void> {
		const companyId = requireCompanyId(ctx);

		await withTransaction(async (client) => {
			await client.query(
				'UPDATE events SET quotation_id = NULL, work_order_id = NULL WHERE company_id = $1',
				[companyId]
			);

			for (const table of TABLES_IN_DELETE_ORDER) {
				await client.query(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
			}
		});
	}
}
