import { statusInfo, statusLabel } from '../shared/business-status';

/**
 * Los estados de negocio de una factura, como LISTA RECORRIBLE.
 *
 * Misma razon de ser que `quotes/status.ts`: sin esto, Cloud y Desktop
 * mantenian cada uno su propio array `ESTADOS` a mano, con las mismas
 * entradas repetidas -y a partir de aqui, tres en vez de dos-.
 *
 * Las etiquetas y los colores NO se duplican aqui: siguen saliendo de
 * `business-status.ts`. Este archivo aporta la lista y la semantica del
 * filtro, nada mas.
 */
export const INVOICE_STATUSES = ['borrador', 'emitida', 'anulada'] as const;

export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export function isInvoiceStatus(value: unknown): value is InvoiceStatusValue {
	return INVOICE_STATUSES.includes(String(value) as InvoiceStatusValue);
}

/** Opciones del selector, con el punto de color que pide `StatusSelect`. */
export function invoiceStatusOptions(): Array<{ value: string; label: string; tone: string }> {
	return INVOICE_STATUSES.map((estado) => ({
		value: estado,
		label: statusLabel(estado),
		tone: tonoDePunto(estado)
	}));
}

/** Las mismas opciones con «cualquier estado» delante, con `''` como valor. */
export function invoiceStatusFilterOptions(): Array<{ value: string; label: string; tone?: string }> {
	return [{ value: '', label: 'Cualquier estado' }, ...invoiceStatusOptions()];
}

function tonoDePunto(estado: InvoiceStatusValue): string {
	const { tone } = statusInfo(estado);
	if (tone === 'success') return 'ok';
	if (tone === 'warning') return 'warn';
	if (tone === 'danger') return 'off';
	return 'none';
}
