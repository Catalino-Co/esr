import type { ESRId, InvoiceItem } from '@esr/schemas';
import { fail, ok, type UseCaseResult } from '../shared/result';

/**
 * ─── Origen de una factura ───────────────────────────────────────────────
 *
 * Antes una factura SOLO podia nacer de una orden con entregas/servicios
 * pendientes. Ahora nace de UNA de tres fuentes, nunca mas de una:
 *
 * - `work_order`: lo de siempre -conduces y/o lineas de Servicio de una orden-.
 * - `quotation`: lineas de una cotizacion aprobada, facturadas DIRECTO, sin
 *   pasar por una orden. Es facturable POR PARTES: cada linea lleva su propia
 *   `quantity`, que puede ser menor que lo que queda pendiente de esa linea.
 * - `free`: factura libre. Sin cotizacion ni orden: un cliente y lineas
 *   escritas/elegidas a mano -articulo de catalogo, servicio, o un cargo de
 *   solo texto (`description`, sin `item_id` ni `service_id`)-.
 */

export type InvoiceOrderSource = {
	kind: 'work_order';
	work_order_id: ESRId | '';
	conduce_ids: readonly ESRId[];
	service_line_ids?: readonly ESRId[];
};

export type InvoiceQuotationLine = {
	quotation_item_id: ESRId;
	quantity: number | string;
};

export type InvoiceQuotationSource = {
	kind: 'quotation';
	quotation_id: ESRId | '';
	lines: readonly InvoiceQuotationLine[];
};

/** Una linea escrita/elegida a mano: articulo de catalogo, servicio, o cargo manual. */
export type FreeInvoiceLine = {
	item_id?: ESRId | '' | null;
	service_id?: ESRId | '' | null;
	/** Unico dato de un cargo manual (sin `item_id` ni `service_id`). */
	description?: string | null;
	quantity: number | string;
	price: number | string;
	discount_rate?: number | string;
	tax_rate?: number | string;
};

export type InvoiceFreeSource = {
	kind: 'free';
	client_id: ESRId | '';
	lines: readonly FreeInvoiceLine[];
};

export type InvoiceSourceDraft = InvoiceOrderSource | InvoiceQuotationSource | InvoiceFreeSource;

export type InvoiceDraft = {
	source: InvoiceSourceDraft;
	/** Ajuste MANUAL de cabecera, ademas de lo que ya traigan las lineas. */
	discount?: number | string;
	tax_amount?: number | string;
};

/** Un cargo manual no tiene `item_id` ni `service_id`: solo `description`. */
export type InvoiceLineKind = 'item' | 'service' | 'manual';

/** Discriminador unico de linea, al estilo de `isServiceLine`. */
export function invoiceLineKind(line: Pick<InvoiceItem, 'item_id' | 'service_id'>): InvoiceLineKind {
	if (line.item_id != null) return 'item';
	if (line.service_id != null) return 'service';
	return 'manual';
}

/**
 * Sustituye al viejo chequeo rigido "tiene que traer `work_order_id` y al
 * menos un conduce o servicio" por reglas propias de cada origen.
 *
 * Lo que NO hace: verificar que un id posteado (cliente, articulo, servicio,
 * cotizacion, orden) de verdad le pertenece al tenant. Esa reverificacion
 * necesita la base de datos y es responsabilidad de quien persiste -mismo
 * reparto que `validateDirectOrderDraft` (forma pura, aqui) y
 * `WorkOrderCreationService.createDirect` (dueño de la base, alla)-.
 */
export function validateInvoiceDraft(draft: InvoiceDraft): UseCaseResult<true> {
	const { source } = draft;

	if (source.kind === 'work_order') {
		if (!source.work_order_id) return fail('invoice.order.required');
		if (!source.conduce_ids.length && !source.service_line_ids?.length) {
			return fail('invoice.order.lines_required');
		}
	} else if (source.kind === 'quotation') {
		if (!source.quotation_id) return fail('invoice.quotation.required');
		if (!source.lines.length) return fail('invoice.quotation.lines_required');
		for (const linea of source.lines) {
			const cantidad = Number(linea.quantity);
			if (!Number.isFinite(cantidad) || cantidad <= 0) return fail('invoice.line.quantity_invalid');
		}
	} else if (source.kind === 'free') {
		if (!source.client_id) return fail('invoice.client.required');
		if (!source.lines.length) return fail('invoice.lines.required');

		for (const linea of source.lines) {
			// Una linea es de UN articulo, de UN servicio, o de ninguno -un cargo
			// manual-, pero nunca de los dos a la vez.
			const tieneArticulo = Boolean(linea.item_id);
			const tieneServicio = Boolean(linea.service_id);
			if (tieneArticulo && tieneServicio) return fail('invoice.line.both_refs');
			if (!tieneArticulo && !tieneServicio && !String(linea.description || '').trim()) {
				return fail('invoice.line.unidentified');
			}

			const cantidad = Number(linea.quantity);
			if (!Number.isFinite(cantidad) || cantidad <= 0) return fail('invoice.line.quantity_invalid');
			const precio = Number(linea.price);
			if (!Number.isFinite(precio) || precio < 0) return fail('invoice.line.price_invalid');

			if (linea.discount_rate != null) {
				const tasa = Number(linea.discount_rate);
				if (!Number.isFinite(tasa) || tasa < 0 || tasa > 100) return fail('invoice.line.rate_invalid');
			}
			if (linea.tax_rate != null) {
				const tasa = Number(linea.tax_rate);
				if (!Number.isFinite(tasa) || tasa < 0) return fail('invoice.line.rate_invalid');
			}
		}
	} else {
		// Defensa contra un POST manipulado: un `kind` que no es ninguno de los
		// tres no deberia poder llegar aqui desde la interfaz.
		return fail('invoice.source.invalid');
	}

	if (draft.discount != null) {
		const descuento = Number(draft.discount);
		if (!Number.isFinite(descuento) || descuento < 0) return fail('invoice.discount.invalid');
	}
	if (draft.tax_amount != null) {
		const impuesto = Number(draft.tax_amount);
		if (!Number.isFinite(impuesto) || impuesto < 0) return fail('invoice.discount.invalid');
	}

	return ok(true);
}

/** Mensajes de `validateInvoiceDraft` y de las validaciones de cotizacion asociadas. */
export const INVOICE_DRAFT_ERRORS: Record<string, string> = {
	'invoice.order.required': 'Falta la orden de trabajo.',
	'invoice.order.lines_required': 'Elija al menos una entrega o un servicio para facturar.',
	'invoice.quotation.required': 'Falta la cotización.',
	'invoice.quotation.lines_required': 'Elija al menos una línea de la cotización para facturar.',
	'invoice.client.required': 'Elija el cliente.',
	'invoice.lines.required': 'Agregue al menos una línea a la factura.',
	'invoice.line.both_refs': 'Una línea no puede ser artículo y servicio a la vez.',
	'invoice.line.unidentified': 'Escriba una descripción para la línea manual.',
	'invoice.line.quantity_invalid': 'Las cantidades tienen que ser mayores que cero.',
	'invoice.line.price_invalid': 'Los precios no pueden ser negativos.',
	'invoice.line.rate_invalid': 'Las tasas de descuento e impuesto no son válidas.',
	'invoice.discount.invalid': 'El descuento y el impuesto no pueden ser negativos.',
	'invoice.source.invalid': 'La factura no indica un origen válido.',
	'quote.must_be_approved_to_invoice': 'Solo se puede facturar directamente una cotización aprobada.',
	'quote.nothing_billable': 'Esta cotización ya está facturada por completo.',
	'quote_item.already_billed': 'Esa línea ya está facturada: anule la factura para poder modificarla.'
};

export function invoiceDraftErrorMessage(code: string | undefined): string {
	return INVOICE_DRAFT_ERRORS[code ?? ''] ?? 'No se pudo emitir la factura.';
}
