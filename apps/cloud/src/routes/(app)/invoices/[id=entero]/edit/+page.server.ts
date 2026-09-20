import { error, fail, redirect } from '@sveltejs/kit';
import { RECORD_STATE, todayISO } from '@esr/core';
import type { Actions, PageServerLoad } from './$types';
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
 * Editar un borrador reutiliza el armado de origen de `/invoices/new`, pero
 * aqui el origen YA esta fijado -sale de `work_order_id`/`quotation_id` de la
 * propia factura- y nunca cambia: no hay selector, ni pantallas de "elija una
 * orden/cotización". Lo unico distinto del alta es que las lineas que ESTE
 * borrador ya reclamo tienen que nacer marcadas, no vacias.
 */
export const load: PageServerLoad = async ({ locals, params }) => {
	const { companyId } = requirePermission(locals, 'invoices.update');
	const ctx = toTenantContext(companyId);

	const invoice = await getInvoiceRepository().findById(ctx, params.id);
	if (!invoice) error(404, 'Factura no encontrada');
	// Un enlace viejo a una factura que ya se finalizo o se anulo no puede
	// seguir editandola: rebota a su ficha de solo lectura.
	if (invoice.status !== 'borrador') redirect(303, `/invoices/${params.id}`);

	const base = { hoy: todayISO(), invoice };

	if (invoice.work_order_id) {
		const [order, conduces, serviciosOrden] = await Promise.all([
			getRentalRepository().findById(ctx, invoice.work_order_id),
			// `alsoClaimedByInvoiceId`: la consulta normal de "facturable" excluye
			// lo que ya esta en una factura, y ESTE borrador ya reclamo algunas de
			// estas entregas/lineas de servicio. Sin el parametro, reabrir el
			// borrador las haria desaparecer de la lista aunque siguieran siendo
			// suyas. Contrato con el agente de backend: cada fila trae ademas un
			// indicador de que YA la reclama esta factura -ver `yaReclamado` en
			// el componente, que documenta el nombre exacto que se espera-.
			getInvoiceRepository().listBillableConduces(ctx, invoice.work_order_id, undefined, {
				alsoClaimedByInvoiceId: invoice.id
			}),
			getInvoiceRepository().listBillableServices(ctx, invoice.work_order_id, undefined, {
				alsoClaimedByInvoiceId: invoice.id
			})
		]);
		if (!order) error(404, 'La orden de esta factura ya no existe.');
		return {
			...base,
			origen: 'orden',
			order,
			conduces,
			serviciosOrden,
			quote: null,
			lineasCotizacion: [],
			items: [],
			services: [],
			clients: [],
			customer: null
		};
	}

	if (invoice.quotation_id) {
		const [quote, lineasCotizacion] = await Promise.all([
			getQuoteRepository().findById(ctx, invoice.quotation_id),
			getInvoiceRepository().listBillableQuotationItems(ctx, invoice.quotation_id, undefined, {
				alsoClaimedByInvoiceId: invoice.id
			})
		]);
		if (!quote) error(404, 'La cotización de esta factura ya no existe.');
		return {
			...base,
			origen: 'cotizacion',
			order: null,
			conduces: [],
			serviciosOrden: [],
			quote,
			lineasCotizacion,
			items: [],
			services: [],
			clients: [],
			customer: null
		};
	}

	// Libre: ni orden ni cotización. Sus lineas actuales SON las de la propia
	// factura -una factura directa no tiene concepto de "facturable" del que
	// tirar, las lineas viven solo en `invoice_items`-.
	const [items, services, clients, customer, lineasFactura] = await Promise.all([
		getInventoryRepository().list(ctx, {}),
		getServiceRepository().list(ctx, {}),
		getCustomerRepository().list(ctx, { state: RECORD_STATE.ACTIVE, limit: 500, offset: 0 }),
		invoice.client_id ? getCustomerRepository().findById(ctx, invoice.client_id) : Promise.resolve(null),
		getInvoiceRepository().listItems(ctx, invoice.id)
	]);
	return {
		...base,
		origen: 'directa',
		order: null,
		conduces: [],
		serviciosOrden: [],
		quote: null,
		lineasCotizacion: [],
		items,
		services,
		clients,
		customer,
		lineasFactura
	};
};

/** Lee y valida el descuento/impuesto de cabecera. Copiado de `/invoices/new`. */
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
	updateDraft: async (event) => {
		const { companyId } = requirePermission(event.locals, 'invoices.update');
		const ctx = toTenantContext(companyId);
		const form = await event.request.formData();

		const invoice = await getInvoiceRepository().findById(ctx, event.params.id);
		if (!invoice) error(404, 'Factura no encontrada');
		// Repetido aqui aunque `load` ya rebote: entre pintar la pantalla y
		// enviar el formulario, otra pestaña pudo finalizar o anular esta misma
		// factura.
		if (invoice.status !== 'borrador') {
			return fail(400, { error: 'Esta factura ya no es un borrador editable.' });
		}

		const ajustes = leerAjustesCabecera(form);
		if ('error' in ajustes) return fail(400, ajustes);

		// El origen sale de la FACTURA, nunca del formulario: un POST manipulado
		// no puede convertir un borrador de orden en uno libre.
		let source;
		if (invoice.work_order_id) {
			const workOrderId = String(form.get('work_order_id') ?? '').trim();
			const conduceIds = form.getAll('conduce_ids').map((value) => String(value).trim()).filter(Boolean);
			const serviceLineIds = form
				.getAll('service_line_ids')
				.map((value) => String(value).trim())
				.filter(Boolean);
			source = {
				kind: 'work_order' as const,
				work_order_id: workOrderId,
				conduce_ids: conduceIds,
				service_line_ids: serviceLineIds
			};
		} else if (invoice.quotation_id) {
			const quotationId = String(form.get('quotation_id') ?? '').trim();
			const lineIds = form.getAll('qi_id').map((value) => String(value).trim());
			const lineQuantities = form.getAll('qi_quantity').map((value) => String(value).trim());
			const lines = lineIds
				.map((quotation_item_id, i) => ({ quotation_item_id, quantity: lineQuantities[i] }))
				.filter((linea) => linea.quotation_item_id);
			source = { kind: 'quotation' as const, quotation_id: quotationId, lines };
		} else {
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
			source = { kind: 'free' as const, client_id: clientId, lines };
		}

		try {
			await getInvoiceService().updateDraft(ctx, event.params.id, {
				source,
				date: ajustes.values.date || null,
				discount: ajustes.discount,
				tax_amount: ajustes.tax_amount,
				notes: ajustes.values.notes || null
			});
		} catch (err) {
			// Mismo motivo que en `/invoices/new`: el servicio relee las lineas
			// dentro de la transaccion, asi que aqui llegan los choques reales.
			return fail(400, { error: (err as Error).message, values: ajustes.values });
		}

		redirect(303, `/invoices/${event.params.id}`);
	}
};
