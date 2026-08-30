import { invalid, isPresent, valid, type ESRId, type Nullable, type ValidationResult } from './shared';

export type InventoryItemType = 'cantidad' | 'serializado' | string;

export type InventoryItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	internal_code?: string;
	name: string;
	category_id: ESRId | '';
	subcategory_id?: Nullable<ESRId> | '';
	description?: string;
	item_type?: InventoryItemType;
	uses_serial?: number | boolean;
	/**
	 * Existencias. Para un articulo de CANTIDAD es la columna `total_quantity`;
	 * para uno SERIALIZADO se deriva de sus seriales, descontando retirados y en
	 * mantenimiento.
	 */
	total_quantity?: number;
	/**
	 * Derivados en cada consulta, NO columnas: `available = total - committed`,
	 * y `committed` es lo que retienen las ordenes vivas. La columna
	 * `available_quantity` que existia se tecleaba a mano y ninguna entrega ni
	 * devolucion la actualizaba (migracion 015).
	 */
	available_quantity?: number;
	committed_quantity?: number;
	rental_price?: number;
	/** Quien lo suministra. Apunta a `suppliers`, que ya tenia su CRUD. */
	supplier_id?: Nullable<ESRId>;
	/** Como se cuenta. Apunta a `units_of_measure`; su `abbr` acompaña a la cantidad. */
	uom_id?: Nullable<ESRId>;
	/**
	 * Minimo por ARTICULO, comparado contra el TOTAL de la empresa: responde
	 * «hay que comprar mas», que es una decision de compra y no de almacen.
	 */
	min_stock?: number;
	status?: string;
	notes?: string;
	is_active?: number;
};

export function validateInventoryItemInput(item: Pick<InventoryItem, 'name' | 'category_id'>): ValidationResult {
	return isPresent(item.name) && isPresent(item.category_id) ? valid() : invalid('inventory_item.required_fields');
}
