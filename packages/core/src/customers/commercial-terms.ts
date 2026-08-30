/**
 * Tipo de documento y condicion de pago de un cliente.
 *
 * Son ENUMS EN CODIGO, no catalogos, y la diferencia importa:
 *
 *  - El conjunto RNC / Cedula / Pasaporte / Otro es fiscal y de pais (DGII),
 *    no algo que cada empresa configure. Si fuera catalogo, todo consumidor que
 *    necesite ramificar —validar el largo del documento, imprimir la etiqueta
 *    correcta en un comprobante— tendria que comparar contra texto libre que
 *    alguien puede renombrar.
 *  - «Credito 30» no es una etiqueta: es la fecha de vencimiento de una
 *    factura. Por eso se guarda el codigo y aqui viven los DIAS. Si se guardara
 *    el texto, el modulo de facturas tendria que reinventar esta tabla.
 *
 * El sector comercial SI es catalogo, y vive en `catalogs/repositories.ts`.
 */

export const DOCUMENT_TYPES = ['rnc', 'cedula', 'pasaporte', 'otro'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
	rnc: 'RNC',
	cedula: 'Cédula',
	pasaporte: 'Pasaporte',
	otro: 'Otro'
};

export const PAYMENT_TERMS = [
	'contado',
	'credito_15',
	'credito_30',
	'credito_60',
	'credito_90'
] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
	contado: 'Contado',
	credito_15: 'Crédito 15 días',
	credito_30: 'Crédito 30 días',
	credito_60: 'Crédito 60 días',
	credito_90: 'Crédito 90 días'
};

/** Dias de credito de cada condicion. Contado es 0, no ausencia. */
export const PAYMENT_TERMS_DAYS: Record<PaymentTerms, number> = {
	contado: 0,
	credito_15: 15,
	credito_30: 30,
	credito_60: 60,
	credito_90: 90
};

export function isDocumentType(value: unknown): value is DocumentType {
	return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isPaymentTerms(value: unknown): value is PaymentTerms {
	return typeof value === 'string' && (PAYMENT_TERMS as readonly string[]).includes(value);
}

/**
 * Normaliza lo que llega de un formulario: el codigo si es valido, `null` en
 * cualquier otro caso.
 *
 * `null` es «sin especificar», y es un estado legitimo y permanente: los
 * clientes que ya existian no tienen ninguno de los dos, y elegir uno por ellos
 * seria inventar un dato fiscal. Por eso no hay valor por defecto.
 */
export function parseDocumentType(value: unknown): DocumentType | null {
	return isDocumentType(value) ? value : null;
}

export function parsePaymentTerms(value: unknown): PaymentTerms | null {
	return isPaymentTerms(value) ? value : null;
}

export function documentTypeLabel(value: unknown): string {
	return isDocumentType(value) ? DOCUMENT_TYPE_LABELS[value] : '—';
}

export function paymentTermsLabel(value: unknown): string {
	return isPaymentTerms(value) ? PAYMENT_TERMS_LABELS[value] : '—';
}
