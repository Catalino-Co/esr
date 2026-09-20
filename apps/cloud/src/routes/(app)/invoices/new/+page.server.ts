import { fail, redirect } from '@sveltejs/kit';
import { RECORD_STATE, todayISO } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import {
	getCustomerRepository,
	getInventoryRepository,
	getInvoiceRepository,
	getInvoiceService,
	getQuoteRepository,
	getRentalRepository,
	getServiceRepository
} from '$lib/server/repositories';
import { toTenantContext } from '$lib/server/tenant';

/**
 * Facturar dejo de exigir una orden con entregas pendientes. Ahora hay TRES
 * origenes -orden, cotización facturada directo, o ninguno de los dos-, y la
 * pantalla los ofrece todos desde el principio: `?order=`/`?quote=`
 * preseleccionan uno (compatibilidad con los enlaces que ya traen desde la
 * ficha de la orden, la cotización o el conduce).
 *
 * El catalogo -articulos, servicios, ordenes y cotizaciones con algo
 * pendiente- se carga SIEMPRE, sin importar cual origen este activo: el
 * selector cambia de origen en el cliente, sin ida y vuelta al servidor.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'invoices.create');
	const ctx = toTenantContext(companyId);

	const orderId = url.searchParams.get('order')?.trim() || '';
	const quoteId = url.searchParams.get('quote')?.trim() || '';

	const [items, services, orders, quotes, clients] = await Promise.all([
		getInventoryRepository().list(ctx, {}),
		getServiceRepository().list(ctx, {}),
		getInvoiceRepository().listOrdersWithBillable(ctx),
		getInvoiceRepository().listQuotationsWithBillable(ctx),
		// Solo para la factura LIBRE: las otras dos rutas ya traen el cliente
		// resuelto -de la orden, de la cotización-.
		getCustomerRepository().list(ctx, { state: RECORD_STATE.ACTIVE, limit: 500, offset: 0 })
	]);

	const base = { hoy: todayISO(), items, services, orders, quotes, clients };

	if (orderId) {
		const order = await getRentalRepository().findById(ctx, orderId);
		if (!order) {
			return { ...base, origenInicial: 'orden', order: null, conduces: [], serviciosOrden: [], quote: null, lineasCotizacion: [], aviso: 'Esa orden no existe en esta empresa.' };
		}
		const [conduces, serviciosOrden] = await Promise.all([
			getInvoiceRepository().listBillableConduces(ctx, orderId),
			// Un Servicio nunca genera un conduce -no es tangible-, asi que se
			// factura por su propio camino, aparte de las entregas.
			getInvoiceRepository().listBillableServices(ctx, orderId)
		]);
		return { ...base, origenInicial: 'orden', order, conduces, serviciosOrden, quote: null, lineasCotizacion: [] };
	}

	if (quoteId) {
		const quote = await getQuoteRepository().findById(ctx, quoteId);
		if (!quote) {
			return { ...base, origenInicial: 'cotizacion', order: null, conduces: [], serviciosOrden: [], quote: null, lineasCotizacion: [], aviso: 'Esa cotización no existe en esta empresa.' };
		}
		const [cliente, lineasCotizacion] = await Promise.all([
			quote.client_id ? getCustomerRepository().findById(ctx, quote.client_id) : Promise.resolve(null),
			getInvoiceRepository().listBillableQuotationItems(ctx, quoteId)
		]);
		return {
			...base,
			origenInicial: 'cotizacion',
			order: null,
			conduces: [],
			serviciosOrden: [],
			quote: { ...quote, client_name: cliente?.name ?? null },
			lineasCotizacion
		};
	}

	return { ...base, origenInicial: '', order: null, conduces: [], serviciosOrden: [], quote: null, lineasCotizacion: [] };
};

/** Lee y valida el descuento/impuesto de cabecera, comunes a los tres origenes. */
function leerAjustesCabecera(form: FormData) {
	const values = {
		date: String(form.get('date') ?? '').trim(),
		discount: String(form.get('discount') ?? '').trim(),
		tax_amount: String(form.get('tax_amount') ?? '').trim(),
		notes: String(form.get('notes') ?? '').trim()
	};
	const discount = values.discount ? Number(values.discount) : 0;
	const tax_amount = values.tax_amount ? Number(values.tax_amount) : 0;
	if (!Number.isFinite(discount) || discount < 0) {
		return { error: 'El descuento no puede ser negativo.', values } as const;
	}
	if (!Number.isFinite(tax_amount) || tax_amount < 0) {
		return { error: 'El impuesto no puede ser negativo.', values } as const;
	}
	return { values, discount, tax_amount } as const;
}

export const actions: Actions = {
	createFromOrder: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const workOrderId = String(form.get('work_order_id') ?? '').trim();
		const conduceIds = form.getAll('conduce_ids').map((value) => String(value).trim()).filter(Boolean);
		const serviceLineIds = form.getAll('service_line_ids').map((value) => String(value).trim()).filter(Boolean);

		const ajustes = leerAjustesCabecera(form);
		if ('error' in ajustes) return fail(400, ajustes);

		let invoice;
		try {
			invoice = await getInvoiceService().create(ctx, {
				source: { kind: 'work_order', work_order_id: workOrderId, conduce_ids: conduceIds, service_line_ids: serviceLineIds },
				date: ajustes.values.date || null,
				discount: ajustes.discount,
				tax_amount: ajustes.tax_amount,
				notes: ajustes.values.notes || null
			});
		} catch (error) {
			// El servicio relee las entregas dentro de la transacción, así que aquí
			// llegan los choques reales: otra factura se llevó una entrega entre que
			// se pintó la pantalla y se envió.
			return fail(400, { error: (error as Error).message, values: ajustes.values });
		}

		await recordAuditLog(event, {
			action: 'invoice.created',
			entity_type: 'invoice',
			entity_id: String(invoice.id),
			description: `Factura ${invoice.invoice_number} emitida desde orden, por ${invoice.total}`,
			metadata: { source: 'work_order', workOrderId, conduceIds, serviceLineIds }
		});

		redirect(303, `/invoices/${invoice.id}`);
	},

	createFromQuote: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const quotationId = String(form.get('quotation_id') ?? '').trim();
		const lineIds = form.getAll('qi_id').map((value) => String(value).trim());
		const lineQuantities = form.getAll('qi_quantity').map((value) => String(value).trim());
		const lines = lineIds
			.map((quotation_item_id, i) => ({ quotation_item_id, quantity: lineQuantities[i] }))
			.filter((linea) => linea.quotation_item_id);

		const ajustes = leerAjustesCabecera(form);
		if ('error' in ajustes) return fail(400, ajustes);

		let invoice;
		try {
			invoice = await getInvoiceService().create(ctx, {
				source: { kind: 'quotation', quotation_id: quotationId, lines },
				date: ajustes.values.date || null,
				discount: ajustes.discount,
				tax_amount: ajustes.tax_amount,
				notes: ajustes.values.notes || null
			});
		} catch (error) {
			return fail(400, { error: (error as Error).message, values: ajustes.values });
		}

		await recordAuditLog(event, {
			action: 'invoice.created',
			entity_type: 'invoice',
			entity_id: String(invoice.id),
			description: `Factura ${invoice.invoice_number} emitida directo de cotización, por ${invoice.total}`,
			metadata: { source: 'quotation', quotationId, lineCount: lines.length }
		});

		redirect(303, `/invoices/${invoice.id}`);
	},

	createDirect: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.create');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const clientId = String(form.get('client_id') ?? '').trim();
		const kinds = form.getAll('line_kind').map((value) => String(value).trim());
		const refIds = form.getAll('line_ref_id').map((value) => String(value).trim());
		const descriptions = form.getAll('line_description').map((value) => String(value).trim());
		const quantities = form.getAll('line_quantity').map((value) => String(value).trim());
		const prices = form.getAll('line_price').map((value) => String(value).trim());

		const lines = kinds.map((kind, i) => ({
			item_id: kind === 'item' ? refIds[i] : null,
			service_id: kind === 'service' ? refIds[i] : null,
			description: kind === 'manual' ? descriptions[i] : null,
			quantity: quantities[i],
			price: prices[i]
		}));

		const ajustes = leerAjustesCabecera(form);
		if ('error' in ajustes) return fail(400, ajustes);

		let invoice;
		try {
			invoice = await getInvoiceService().create(ctx, {
				source: { kind: 'free', client_id: clientId, lines },
				date: ajustes.values.date || null,
				discount: ajustes.discount,
				tax_amount: ajustes.tax_amount,
				notes: ajustes.values.notes || null
			});
		} catch (error) {
			return fail(400, { error: (error as Error).message, values: ajustes.values });
		}

		await recordAuditLog(event, {
			action: 'invoice.created',
			entity_type: 'invoice',
			entity_id: String(invoice.id),
			description: `Factura ${invoice.invoice_number} emitida libre, por ${invoice.total}`,
			metadata: { source: 'free', clientId, lineCount: lines.length }
		});

		redirect(303, `/invoices/${invoice.id}`);
	}
};
