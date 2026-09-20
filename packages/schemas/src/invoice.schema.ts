import type { ESRId, Nullable } from './shared';

/**
 * La factura: el documento de dinero de ESR.
 *
 * Nace de UNO de tres origenes, nunca mas de uno: una o varias ENTREGAS
 * (`work_order_id`) de una orden, un grupo de lineas de una COTIZACION
 * aprobada (`quotation_id`, facturable por partes y mas de una vez), o
 * ninguno de los dos -factura libre, solo cliente y lineas escritas a mano-.
 * El conduce sigue siendo la nota de entrega; la factura es lo que se cobra.
 *
 * Tres estados, no dos. Nace `borrador` -editable: se le pueden cambiar las
 * lineas, el cliente (si es libre) y los ajustes de cabecera mientras nadie
 * la trate como definitiva- y una accion aparte ("Finalizar factura") la
 * deja `emitida`, que sigue siendo el unico estado que admite cobros y a
 * partir del cual ya no se edita. `anulada` se alcanza desde cualquiera de
 * los otros dos -anular un borrador es como se descarta, sin inventar un
 * concepto nuevo de "descartar"-. «Cobrada» sigue sin guardarse: se deriva
 * de los pagos, y guardarlo la condenaria a desincronizarse del saldo real.
 */
export type InvoiceStatus = 'borrador' | 'emitida' | 'anulada' | string;

export type Invoice = {
	id?: Nullable<ESRId>;
	company_id?: string;
	invoice_number?: string;
	work_order_id?: Nullable<ESRId>;
	/** Cotizacion facturada directamente. Excluyente con `work_order_id`. */
	quotation_id?: Nullable<ESRId>;
	client_id?: Nullable<ESRId>;
	date?: Nullable<string>;
	status?: InvoiceStatus;
	/** Llegan como texto desde PostgreSQL: NUMERIC no cabe en un number sin perder centavos. */
	subtotal?: number | string;
	discount?: number | string;
	/** Suma de `invoice_items.tax_rate` aplicado, mas cualquier ajuste manual de cabecera. */
	tax_amount?: number | string;
	total?: number | string;
	notes?: Nullable<string>;
	cancelled_at?: Nullable<string>;
	cancel_reason?: Nullable<string>;
	is_active?: number;
	created_at?: string;
	updated_at?: Nullable<string>;
	/** Solo en los listados: nombre del cliente y numero de orden/cotizacion, por join. */
	client_name?: Nullable<string>;
	order_number?: Nullable<string>;
	quote_number?: Nullable<string>;
	/** Solo en los listados: suma de los pagos confirmados, calculada en SQL. */
	paid?: number | string;
};

export type InvoiceItem = {
	id?: Nullable<ESRId>;
	company_id?: string;
	invoice_id?: ESRId;
	item_id?: Nullable<ESRId>;
	/** Ver `service.schema.ts`. Excluyente con `item_id`: una linea es de uno o de otro. */
	service_id?: Nullable<ESRId>;
	/**
	 * Texto de la linea. En una linea de articulo/servicio es el nombre del
	 * catalogo copiado al vuelo; en un CARGO MANUAL (ni `item_id` ni
	 * `service_id`) es el unico dato que la identifica.
	 */
	description?: Nullable<string>;
	quantity: number | string;
	price: number | string;
	/** El BRUTO de la linea (cantidad x precio). El descuento y el impuesto
	 *  se derivan de `discount_rate`/`tax_rate` con `calculateQuoteLineAmounts`,
	 *  igual que en una cotizacion -no se guardan ya restados-. */
	total: number | string;
	/** Porcentaje, igual que `quotation_items`. Solo una linea copiada de una
	 *  cotizacion trae esto distinto de 0 hoy. */
	discount_rate?: number | string;
	tax_rate?: number | string;
	/** Solo en las lecturas: codigo interno del articulo, por join. */
	internal_code?: Nullable<string>;
};

/**
 * Fila de `invoice_quotation_items`: que linea de una COTIZACION cubre la
 * factura, y CUANTO -a diferencia de `InvoiceWorkOrderItem`, una cotizacion
 * se factura por partes, no todo o nada-. `is_active = 0` (al anular la
 * factura) devuelve esa cantidad a lo facturable.
 */
export type InvoiceQuotationItem = {
	id?: Nullable<ESRId>;
	invoice_id: ESRId;
	quotation_item_id: ESRId;
	quantity: number | string;
	is_active?: number;
	/** Por join, para poder enseñar la linea sin una consulta mas. */
	name?: Nullable<string>;
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

/**
 * Fila de `invoice_work_order_items`: que linea de Servicio de una orden
 * cubre la factura. Un Servicio nunca genera un conduce -no es tangible-,
 * asi que necesita este enlace propio en vez de `invoice_conduces` para
 * saber que ya se facturo. Mismo mecanismo: `is_active` en 0 libera la
 * linea para volver a facturarla si la factura se anula.
 */
export type InvoiceWorkOrderItem = {
	id?: Nullable<ESRId>;
	invoice_id: ESRId;
	work_order_item_id: ESRId;
	is_active?: number;
	/** Por join, para poder enseñar el servicio sin una consulta mas. */
	service_name?: Nullable<string>;
};
