import { calculateQuoteTotals, RECORD_STATE, round2, validateInvoiceDraft, type RepositoryContext } from '@esr/core';
import { invoiceDraftErrorMessage, validateQuoteCanInvoiceDirectly } from '@esr/core';
import { validateInvoiceCanEdit, validateInvoiceCanFinalize, validateInvoiceSourceUnchanged } from '@esr/core';
import type { InvoiceDraft, InvoiceFreeSource, InvoiceOrderSource, InvoiceQuotationSource } from '@esr/core';
import type { ESRId, Invoice } from '@esr/schemas';
import type pg from 'pg';
import { withTransaction } from '../transaction';
import { PostgresConduceRepository } from '../repositories/postgres-conduce.repository';
import { PostgresCustomerRepository } from '../repositories/postgres-customer.repository';
import { PostgresInventoryRepository } from '../repositories/postgres-inventory.repository';
import { PostgresInvoiceRepository } from '../repositories/postgres-invoice.repository';
import { PostgresPaymentRepository } from '../repositories/postgres-payment.repository';
import { PostgresQuoteRepository } from '../repositories/postgres-quote.repository';
import { PostgresServiceRepository } from '../repositories/postgres-catalog.repository';

/**
 * Emision y anulacion de facturas.
 *
 * Una factura nace de UNA de tres fuentes -ver `InvoiceDraft` en
 * `@esr/core`-: una orden (entregas/servicios, como siempre), una cotizacion
 * aprobada (facturada DIRECTO, por partes), o ninguna de las dos -factura
 * libre-. Las lineas se COPIAN de su origen -conduce, linea de orden, linea
 * de cotizacion- o se escriben a mano; nunca se leen por join, para que una
 * factura ya emitida no cambie si el origen se corrige despues.
 */

/** Codigo de PostgreSQL para violacion de indice unico. */
const UNIQUE_VIOLATION = '23505';

/** Reintentos al chocar dos emisiones por el mismo numero. */
const NUMBER_RETRIES = 5;

export type CreateInvoiceInput = InvoiceDraft & {
	date?: string | null;
	notes?: string | null;
};

type PreparedLine = {
	item_id: ESRId | null;
	service_id: ESRId | null;
	description: string | null;
	quantity: number;
	price: number;
	discount_rate: number;
	tax_rate: number;
};

type PreparedInvoice = {
	client_id: ESRId | null;
	work_order_id: ESRId | null;
	quotation_id: ESRId | null;
	lines: PreparedLine[];
	links: {
		conduces: string[];
		workOrderItems: string[];
		quotationItems: Array<{ id: ESRId; quantity: number }>;
	};
};

export class InvoiceService {
	constructor(
		private readonly invoices = new PostgresInvoiceRepository(),
		private readonly conduces = new PostgresConduceRepository(),
		private readonly payments = new PostgresPaymentRepository(),
		private readonly quotes = new PostgresQuoteRepository(),
		private readonly customers = new PostgresCustomerRepository(),
		private readonly inventory = new PostgresInventoryRepository(),
		private readonly services = new PostgresServiceRepository()
	) {}

	/**
	 * Emite una factura desde cualquiera de sus tres origenes posibles.
	 *
	 * Todo va en una transaccion: cabecera, lineas y enlaces. El enlace es
	 * precisamente lo que impide facturar dos veces lo mismo, asi que
	 * escribirlo fuera dejaria una ventana para el doble clic.
	 */
	async create(ctx: RepositoryContext, input: CreateInvoiceInput): Promise<Invoice> {
		const check = validateInvoiceDraft(input);
		if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

		// La factura libre no compite por ningun contador compartido -no hay "lo
		// que queda" que dos emisiones simultaneas puedan repartirse de mas-, asi
		// que su verificacion de pertenencia va ANTES de la transaccion, igual
		// que `WorkOrderCreationService.createDirect`. Los otros dos origenes SI
		// leen y bloquean un contador compartido, y por eso su verificacion tiene
		// que vivir DENTRO de la transaccion (mas abajo).
		const freePrepared =
			input.source.kind === 'free' ? await this.prepareFree(ctx, input.source) : null;

		return withTransaction(async (client) => {
			const prepared: PreparedInvoice =
				input.source.kind === 'work_order'
					? await this.prepareFromWorkOrder(ctx, input.source, client)
					: input.source.kind === 'quotation'
						? await this.prepareFromQuotation(ctx, input.source, client)
						: freePrepared!;

			// Una sola formula para los tres caminos, la misma que usa la
			// cotizacion: el descuento/impuesto de linea (solo distinto de 0 en el
			// camino de cotizacion) se suma al ajuste MANUAL de cabecera.
			const totals = calculateQuoteTotals(prepared.lines);
			const discount = round2(totals.discount + Math.max(0, Number(input.discount ?? 0)));
			const tax_amount = round2(totals.tax_amount + Math.max(0, Number(input.tax_amount ?? 0)));
			if (discount > totals.subtotal) {
				throw new Error('El descuento no puede superar el subtotal.');
			}

			const factura = await this.insertWithNumber(ctx, client, {
				work_order_id: prepared.work_order_id,
				quotation_id: prepared.quotation_id,
				client_id: prepared.client_id,
				date: input.date ?? null,
				subtotal: totals.subtotal,
				discount,
				tax_amount,
				total: round2(totals.subtotal - discount + tax_amount),
				notes: input.notes ?? null
			});

			for (const linea of prepared.lines) {
				await this.invoices.insertItem(ctx, factura.id!, linea, client);
			}
			for (const conduceId of prepared.links.conduces) {
				await this.invoices.linkConduce(ctx, factura.id!, conduceId, client);
			}
			for (const workOrderItemId of prepared.links.workOrderItems) {
				await this.invoices.linkWorkOrderItem(ctx, factura.id!, workOrderItemId, client);
			}
			for (const linea of prepared.links.quotationItems) {
				await this.invoices.linkQuotationItem(ctx, factura.id!, linea.id, linea.quantity, client);
			}

			return factura;
		});
	}

	/**
	 * Anula la factura, sus cobros y sus enlaces, en una sola transaccion.
	 *
	 * Devuelve cuantos cobros se anularon: la pantalla lo dice, porque anular una
	 * factura cobrada deshace dinero ya registrado y eso no puede pasar callado.
	 */
	async cancel(
		ctx: RepositoryContext,
		invoiceId: ESRId,
		reason: string | null
	): Promise<{ invoice: Invoice; voidedPayments: number }> {
		return withTransaction(async (client) => {
			const invoice = await this.invoices.cancel(ctx, invoiceId, reason, client);
			const voidedPayments = await this.payments.voidByInvoice(ctx, invoiceId, client);
			return { invoice, voidedPayments };
		});
	}

	/**
	 * Reescribe un borrador entero -cabecera y lineas, del origen que sea-.
	 *
	 * Mismo mecanismo que `create()`: suelta TODO lo que este borrador tenia
	 * reclamado (mismo paso que `cancel()`), relee disponibilidad actual con los
	 * mismos `prepareFrom*` sin modificar, y reclama de nuevo. Es reemplazo
	 * COMPLETO, no un diff: el llamador siempre manda la seleccion entera
	 * deseada, igual que ya hace `create()`.
	 */
	async updateDraft(ctx: RepositoryContext, invoiceId: ESRId, input: CreateInvoiceInput): Promise<Invoice> {
		const check = validateInvoiceDraft(input);
		if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

		// Misma razon que en `create()`: la factura libre no compite por ningun
		// contador compartido, asi que su verificacion de pertenencia va ANTES de
		// la transaccion.
		const freePrepared =
			input.source.kind === 'free' ? await this.prepareFree(ctx, input.source) : null;

		return withTransaction(async (client) => {
			const invoice = await this.invoices.findById(ctx, invoiceId, client);
			if (!invoice) throw new Error('La factura no existe en esta empresa.');

			const editCheck = validateInvoiceCanEdit(invoice);
			if (!editCheck.ok) throw new Error(invoiceDraftErrorMessage(editCheck.error));
			const originCheck = validateInvoiceSourceUnchanged(invoice, input.source);
			if (!originCheck.ok) throw new Error(invoiceDraftErrorMessage(originCheck.error));

			// Release-antes-de-reclamar: suelta TODO lo que este borrador tenia
			// reclamado para que `prepareFrom*` -sin modificar, los mismos que usa
			// `create()`- lo vuelva a ver disponible al releer.
			await this.invoices.releaseLinks(ctx, invoiceId, client);
			await this.invoices.deleteItems(ctx, invoiceId, client);

			const prepared: PreparedInvoice =
				input.source.kind === 'work_order'
					? await this.prepareFromWorkOrder(ctx, input.source, client)
					: input.source.kind === 'quotation'
						? await this.prepareFromQuotation(ctx, input.source, client)
						: freePrepared!;

			// Misma formula que `create()`.
			const totals = calculateQuoteTotals(prepared.lines);
			const discount = round2(totals.discount + Math.max(0, Number(input.discount ?? 0)));
			const tax_amount = round2(totals.tax_amount + Math.max(0, Number(input.tax_amount ?? 0)));
			if (discount > totals.subtotal) {
				throw new Error('El descuento no puede superar el subtotal.');
			}

			const actualizada = await this.invoices.updateHeader(
				ctx,
				invoiceId,
				{
					client_id: prepared.client_id,
					date: input.date ?? null,
					subtotal: totals.subtotal,
					discount,
					tax_amount,
					total: round2(totals.subtotal - discount + tax_amount),
					notes: input.notes ?? null
				},
				client
			);

			for (const linea of prepared.lines) {
				await this.invoices.insertItem(ctx, invoiceId, linea, client);
			}
			for (const conduceId of prepared.links.conduces) {
				await this.invoices.linkConduce(ctx, invoiceId, conduceId, client);
			}
			for (const workOrderItemId of prepared.links.workOrderItems) {
				await this.invoices.linkWorkOrderItem(ctx, invoiceId, workOrderItemId, client);
			}
			for (const linea of prepared.links.quotationItems) {
				await this.invoices.linkQuotationItem(ctx, invoiceId, linea.id, linea.quantity, client);
			}

			return actualizada;
		});
	}

	/** Finaliza el borrador: exige al menos una linea. Sin cascada -los enlaces ya se reclamaron en `create()`/`updateDraft()`-. */
	async finalize(ctx: RepositoryContext, invoiceId: ESRId): Promise<Invoice> {
		return withTransaction(async (client) => {
			const invoice = await this.invoices.findById(ctx, invoiceId, client);
			if (!invoice) throw new Error('La factura no existe en esta empresa.');
			const items = await this.invoices.listItems(ctx, invoiceId, client);
			const check = validateInvoiceCanFinalize(invoice, items.length);
			if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));
			return this.invoices.finalize(ctx, invoiceId, client);
		});
	}

	/** Origen Orden: el camino de siempre, sin cambios de comportamiento. */
	private async prepareFromWorkOrder(
		ctx: RepositoryContext,
		source: InvoiceOrderSource,
		client: pg.PoolClient
	): Promise<PreparedInvoice> {
		// Se releen aqui dentro, no se fian de lo que trajo el formulario: entre
		// que se pinto la pantalla y se envio, otra factura pudo tomarlas.
		const disponibles = await this.invoices.listBillableConduces(ctx, source.work_order_id, client);
		const porId = new Map(disponibles.map((row) => [String(row.id), row]));

		const elegidas = source.conduce_ids.map(String);
		const tomadas = elegidas.filter((id) => !porId.has(id));
		if (tomadas.length) {
			throw new Error(
				'Alguna de las entregas elegidas ya se facturó o dejó de estar disponible. Vuelva a cargar la página.'
			);
		}

		// Mismo relectura-y-comprobacion que las entregas, para las lineas de
		// Servicio: entre que se pinto la pantalla y se envio, otra factura pudo
		// tomarlas.
		const serviciosDisponibles = await this.invoices.listBillableServices(ctx, source.work_order_id, client);
		const servicioPorId = new Map(serviciosDisponibles.map((row) => [String(row.id), row]));
		const serviciosElegidos = (source.service_line_ids ?? []).map(String);
		const serviciosTomados = serviciosElegidos.filter((id) => !servicioPorId.has(id));
		if (serviciosTomados.length) {
			throw new Error(
				'Alguno de los servicios elegidos ya se facturó o dejó de estar disponible. Vuelva a cargar la página.'
			);
		}

		const lineasConduce = await this.aggregateConduceLines(ctx, elegidas, client);
		// Un Servicio NO se fusiona con otro aunque coincidan nombre y precio:
		// cada linea de la orden se factura por separado, una por una.
		const lineasServicio: PreparedLine[] = serviciosElegidos.map((id) => {
			const fila = servicioPorId.get(id)!;
			return {
				item_id: null,
				service_id: fila.service_id,
				description: fila.name,
				quantity: round2(Number(fila.quantity ?? 0)),
				price: round2(Number(fila.price ?? 0)),
				discount_rate: 0,
				tax_rate: 0
			};
		});
		const lineas = [...lineasConduce, ...lineasServicio];
		if (!lineas.length) {
			throw new Error('Lo elegido no tiene ninguna línea que facturar.');
		}

		const orden = await client.query<{ client_id: ESRId | null }>(
			'SELECT client_id FROM work_orders WHERE company_id = $1 AND id = $2',
			[ctx.companyId, source.work_order_id]
		);
		if (!orden.rows[0]) throw new Error('La orden no existe en esta empresa.');

		return {
			client_id: orden.rows[0].client_id,
			work_order_id: source.work_order_id as ESRId,
			quotation_id: null,
			lines: lineas,
			links: { conduces: elegidas, workOrderItems: serviciosElegidos, quotationItems: [] }
		};
	}

	/**
	 * Origen Cotizacion: facturacion DIRECTA, sin orden, y POR PARTES.
	 *
	 * El precio, el descuento y el impuesto se copian TAL CUAL de la
	 * cotizacion -es el acuerdo comercial que el cliente ya aprobo, no se
	 * re-cotiza-. Solo la cantidad puede ser menor que la de la linea
	 * original: es justo lo que habilita facturar una parte ahora y el resto
	 * despues.
	 */
	private async prepareFromQuotation(
		ctx: RepositoryContext,
		source: InvoiceQuotationSource,
		client: pg.PoolClient
	): Promise<PreparedInvoice> {
		const quote = await this.quotes.findById(ctx, source.quotation_id, client);
		if (!quote) throw new Error('La cotización no existe en esta empresa.');

		// Bloquea las lineas elegidas ANTES de leer cuanto queda: es lo que
		// impide que dos emisiones simultaneas de la misma cotizacion se
		// repartan mas cantidad de la que en realidad hay.
		await this.invoices.lockQuotationItems(
			ctx,
			source.lines.map((l) => l.quotation_item_id),
			client
		);
		const disponibles = await this.invoices.listBillableQuotationItems(ctx, source.quotation_id, client);
		const porId = new Map(disponibles.map((row) => [String(row.id), row]));

		const check = validateQuoteCanInvoiceDirectly(quote, disponibles);
		if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

		const lineas: PreparedLine[] = [];
		const enlaces: Array<{ id: ESRId; quantity: number }> = [];

		for (const elegida of source.lines) {
			const fila = porId.get(String(elegida.quotation_item_id));
			if (!fila) {
				throw new Error(
					'Alguna de las líneas elegidas ya se facturó o cambió de cantidad. Vuelva a cargar la página.'
				);
			}
			const cantidad = round2(Number(elegida.quantity));
			if (cantidad <= 0 || cantidad > Number(fila.remaining)) {
				throw new Error(
					'Alguna de las líneas elegidas ya se facturó o cambió de cantidad. Vuelva a cargar la página.'
				);
			}

			lineas.push({
				item_id: fila.item_id,
				service_id: fila.service_id,
				description: fila.name,
				quantity: cantidad,
				price: round2(Number(fila.price)),
				discount_rate: Number(fila.discount_rate) || 0,
				tax_rate: Number(fila.tax_rate) || 0
			});
			enlaces.push({ id: fila.id, quantity: cantidad });
		}

		return {
			client_id: (quote.client_id || null) as ESRId | null,
			work_order_id: null,
			quotation_id: source.quotation_id as ESRId,
			lines: lineas,
			links: { conduces: [], workOrderItems: [], quotationItems: enlaces }
		};
	}

	/**
	 * Origen libre: sin cotizacion ni orden. Verifica que el cliente y cada
	 * articulo/servicio posteado de verdad pertenecen a esta empresa -ningun
	 * id del formulario se cree por venir de un `<select>`, mismo principio
	 * que `WorkOrderCreationService.createDirect`-. Un cargo manual (ni
	 * `item_id` ni `service_id`) no tiene nada que verificar: su unico dato es
	 * el texto que trae.
	 *
	 * Deliberadamente NO reserva stock ni crea ningun rastro de entrega para
	 * un Articulo facturado aqui: la factura nunca ha tocado
	 * `stock_movements` y esta no es la excepcion.
	 */
	private async prepareFree(ctx: RepositoryContext, source: InvoiceFreeSource): Promise<PreparedInvoice> {
		const cliente = await this.customers.findById(ctx, source.client_id as ESRId);
		if (!cliente) throw new Error('El cliente no pertenece a su empresa.');

		const nombresArticulo = new Map<string, string>();
		const nombresServicio = new Map<string, string>();

		const lineas: PreparedLine[] = [];
		for (const linea of source.lines) {
			let descripcion = linea.description?.trim() || null;

			if (linea.item_id) {
				const clave = String(linea.item_id);
				if (!nombresArticulo.has(clave)) {
					const item = await this.inventory.findById(ctx, linea.item_id as ESRId);
					if (!item) throw new Error('Uno de los artículos no pertenece a su empresa.');
					if (item.is_active !== RECORD_STATE.ACTIVE) {
						throw new Error(`El artículo "${item.name}" está inactivo o archivado y no puede facturarse.`);
					}
					nombresArticulo.set(clave, item.name ?? `#${linea.item_id}`);
				}
				descripcion = nombresArticulo.get(clave)!;
			} else if (linea.service_id) {
				const clave = String(linea.service_id);
				if (!nombresServicio.has(clave)) {
					const service = await this.services.findById(ctx, linea.service_id as ESRId);
					if (!service) throw new Error('Uno de los servicios no pertenece a su empresa.');
					if (service.is_active !== RECORD_STATE.ACTIVE) {
						throw new Error(`El servicio "${service.name}" está inactivo o archivado y no puede facturarse.`);
					}
					nombresServicio.set(clave, service.name ?? `#${linea.service_id}`);
				}
				descripcion = nombresServicio.get(clave)!;
			}

			lineas.push({
				item_id: (linea.item_id || null) as ESRId | null,
				service_id: (linea.service_id || null) as ESRId | null,
				description: descripcion,
				quantity: round2(Number(linea.quantity)),
				price: round2(Number(linea.price)),
				discount_rate: Number(linea.discount_rate) || 0,
				tax_rate: Number(linea.tax_rate) || 0
			});
		}

		return {
			client_id: cliente.id as ESRId,
			work_order_id: null,
			quotation_id: null,
			lines: lineas,
			links: { conduces: [], workOrderItems: [], quotationItems: [] }
		};
	}

	/**
	 * Une las lineas de varias entregas en una sola lista.
	 *
	 * Se agrupan por articulo Y precio: el mismo articulo entregado en dos tandas
	 * es una linea, pero si sale a dos precios distintos son dos, porque
	 * fusionarlas inventaria un precio que nadie acordo.
	 */
	private async aggregateConduceLines(
		ctx: RepositoryContext,
		conduceIds: string[],
		client: pg.PoolClient
	): Promise<PreparedLine[]> {
		const acumulado = new Map<string, PreparedLine>();

		for (const conduceId of conduceIds) {
			const items = await this.conduces.listItems(ctx, conduceId, client);
			for (const item of items) {
				const price = round2(Number(item.price ?? 0));
				const clave = `${item.item_id ?? 'libre'}|${price}`;
				const previo = acumulado.get(clave);
				if (previo) {
					previo.quantity = round2(previo.quantity + Number(item.quantity ?? 0));
					continue;
				}
				acumulado.set(clave, {
					item_id: item.item_id ?? null,
					service_id: null,
					description: item.name ?? null,
					quantity: round2(Number(item.quantity ?? 0)),
					price,
					discount_rate: 0,
					tax_rate: 0
				});
			}
		}

		return [...acumulado.values()].filter((linea) => linea.quantity > 0);
	}

	/**
	 * Inserta la cabecera reintentando si el numero ya lo tomo otra emision.
	 *
	 * El numero se calcula leyendo el maximo, que es una carrera. El indice unico
	 * la convierte en un 23505 en vez de en dos facturas con el mismo numero;
	 * esto es lo que lo recoge. La cotizacion no tiene ni el indice ni esto, y por
	 * eso puede duplicar numero en silencio.
	 */
	private async insertWithNumber(
		ctx: RepositoryContext,
		client: pg.PoolClient,
		data: Omit<Parameters<PostgresInvoiceRepository['insertHeader']>[1], 'invoice_number'>
	): Promise<Invoice> {
		for (let intento = 0; intento < NUMBER_RETRIES; intento += 1) {
			const invoice_number = await this.invoices.nextInvoiceNumber(ctx, client);
			try {
				// SAVEPOINT: sin el, el 23505 aborta la transaccion entera y el
				// reintento fallaria con "current transaction is aborted".
				await client.query('SAVEPOINT emitir_factura');
				return await this.invoices.insertHeader(ctx, { ...data, invoice_number }, client);
			} catch (error) {
				await client.query('ROLLBACK TO SAVEPOINT emitir_factura');
				if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
			}
		}
		throw new Error('No se pudo asignar un número de factura libre. Vuelva a intentarlo.');
	}
}
