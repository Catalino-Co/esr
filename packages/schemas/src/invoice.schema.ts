import type { ESRId, Nullable } from './shared';

/**
 * La factura: el documento de dinero de ESR.
 *
 * Cubre una o varias ENTREGAS de la misma orden y nunca una devolucion. El
 * conduce sigue siendo la nota de entrega; la factura es lo que se cobra.
 *
 * Solo dos estados. «Cobrada» no se guarda: se deriva de los pagos, y guardarlo
 * lo condenaria a desincronizarse del saldo real.
 */
export type InvoiceStatus = 'emitida' | 'anulada' | string;

export type Invoice = {
	id?: Nullable<ESRId>;
	company_id?: string;
	invoice_number?: string;
	work_order_id?: Nullable<ESRId>;
	client_id?: Nullable<ESRId>;
	date?: Nullable<string>;
	status?: InvoiceStatus;
	/** Llegan como texto desde PostgreSQL: NUMERIC no cabe en un number sin perder centavos. */
	subtotal?: number | string;
	discount?: number | string;
	total?: number | string;
	notes?: Nullable<string>;
	cancelled_at?: Nullable<string>;
	cancel_reason?: Nullable<string>;
	is_active?: number;
	created_at?: string;
	updated_at?: Nullable<string>;
	/** Solo en los listados: nombre del cliente y numero de orden, por join. */
	client_name?: Nullable<string>;
	order_number?: Nullable<string>;
	/** Solo en los listados: suma de los pagos confirmados, calculada en SQL. */
	paid?: number | string;
};

export type InvoiceItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	invoice_id?: ESRId;
	item_id?: Nullable<ESRId>;
	description?: Nullable<string>;
	quantity: number | string;
	price: number | string;
	total: number | string;
	/** Solo en las lecturas: codigo interno del articulo, por join. */
	internal_code?: Nullable<string>;
};

/** Fila de `invoice_conduces`: que entrega cubre la factura. */
export type InvoiceConduce = {
	id?: Nullable<ESRId>;
	invoice_id: ESRId;
	conduce_id: ESRId;
	is_active?: number;
	/** Por join, para poder enseñar la entrega sin una consulta mas. */
	note_number?: Nullable<string>;
	date?: Nullable<string>;
};
