import { error, json } from '@sveltejs/kit';
import { summarizePayments } from '@esr/core';
import type { RequestHandler } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import {
	getCompanyDocumentInfo,
	getCustomerRepository,
	getInvoiceRepository,
	getPaymentRepository
} from '$lib/server/repositories';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Datos del PDF de una factura. Mismo patron que
 * `work-orders/[id=entero]/document/+server.ts`: POST (para que un prefetch
 * de SvelteKit no dispare la auditoria), audita `document.printed`, y el PDF
 * se arma en el CLIENTE con jsPDF.
 *
 * A diferencia de la hoja de orden, aqui el PRECIO SI va: es justo lo que
 * distingue una factura de una lista de preparacion.
 */
export const POST: RequestHandler = async (event) => {
	const { companyId } = requirePermission(event.locals, 'invoices.view');
	const ctx = toTenantContext(companyId);

	const invoice = await getInvoiceRepository().findById(ctx, event.params.id);
	if (!invoice) error(404, 'Factura no encontrada');

	const [items, customer, payments, company] = await Promise.all([
		getInvoiceRepository().listItems(ctx, event.params.id),
		invoice.client_id ? getCustomerRepository().findById(ctx, invoice.client_id) : Promise.resolve(null),
		getPaymentRepository().listForInvoice(ctx, event.params.id),
		getCompanyDocumentInfo(ctx)
	]);

	await recordAuditLog(event, {
		action: 'document.printed',
		entity_type: 'invoice',
		entity_id: String(invoice.id),
		description: `Impresión de factura ${invoice.invoice_number}`,
		metadata: { invoiceNumber: invoice.invoice_number }
	});

	const summary = summarizePayments(invoice.total, payments);

	return json({
		company,
		invoice: {
			// `order_number`/`quote_number` ya vienen por join de `findById`; los
			// tres datos del cliente que faltan (RNC, telefono, direccion) NO
			// estan en `INVOICE_COLUMNS` -esa lista solo trae `client_name`-, asi
			// que se completan aqui, igual que hace la hoja de orden.
			...invoice,
			client_name: customer?.name ?? invoice.client_name ?? null,
			client_document: customer?.document_id ?? null,
			client_phone: customer?.phone ?? null,
			client_address: customer?.address ?? null,
			paid: summary.paid,
			balance: summary.balance
		},
		items
	});
};
