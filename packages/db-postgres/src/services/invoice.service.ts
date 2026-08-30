import type { RepositoryContext } from '@esr/core';
import type { ESRId, Invoice } from '@esr/schemas';
import type pg from 'pg';
import { withTransaction } from '../transaction';
import { PostgresConduceRepository } from '../repositories/postgres-conduce.repository';
import { PostgresInvoiceRepository } from '../repositories/postgres-invoice.repository';
import { PostgresPaymentRepository } from '../repositories/postgres-payment.repository';

/**
 * Emision y anulacion de facturas.
 *
 * Una factura cubre una o varias ENTREGAS de la misma orden. Las lineas se
 * COPIAN de esas entregas —no se leen por join— para que una factura ya emitida
 * no cambie si alguien corrige el conduce despues.
 */

/** Codigo de PostgreSQL para violacion de indice unico. */
const UNIQUE_VIOLATION = '23505';

/** Reintentos al chocar dos emisiones por el mismo numero. */
const NUMBER_RETRIES = 5;

export type CreateInvoiceInput = {
	work_order_id: ESRId;
	/** Entregas a cubrir. Al menos una. */
	conduce_ids: ESRId[];
	date?: string | null;
	discount?: number;
	notes?: string | null;
};

type Aggregated = {
	item_id: ESRId | null;
	description: string | null;
	quantity: number;
	price: number;
};

export class InvoiceService {
	constructor(
		private readonly invoices = new PostgresInvoiceRepository(),
		private readonly conduces = new PostgresConduceRepository(),
		private readonly payments = new PostgresPaymentRepository()
	) {}

	/**
	 * Emite una factura sobre las entregas elegidas.
	 *
	 * Todo va en una transaccion: cabecera, lineas y enlaces. El enlace es
	 * precisamente lo que impide facturar dos veces la misma entrega, asi que
	 * escribirlo fuera dejaria una ventana para el doble clic.
	 */
	async create(ctx: RepositoryContext, input: CreateInvoiceInput): Promise<Invoice> {
		if (!input.conduce_ids.length) {
			throw new Error('Hay que elegir al menos una entrega para facturar.');
		}

		return withTransaction(async (client) => {
			// Se releen aqui dentro, no se fian de lo que trajo el formulario: entre
			// que se pinto la pantalla y se envio, otra factura pudo tomarlas.
			const disponibles = await this.invoices.listBillableConduces(
				ctx,
				input.work_order_id,
				client
			);
			const porId = new Map(disponibles.map((row) => [String(row.id), row]));

			const elegidas = input.conduce_ids.map(String);
			const tomadas = elegidas.filter((id) => !porId.has(id));
			if (tomadas.length) {
				throw new Error(
					'Alguna de las entregas elegidas ya se facturó o dejó de estar disponible. Vuelva a cargar la página.'
				);
			}

			const lineas = await this.aggregateLines(ctx, elegidas, client);
			if (!lineas.length) {
				throw new Error('Las entregas elegidas no tienen ninguna línea que facturar.');
			}

			const subtotal = round(
				lineas.reduce((suma, linea) => suma + linea.quantity * linea.price, 0)
			);
			const discount = round(Math.max(0, Number(input.discount ?? 0)));
			if (discount > subtotal) {
				throw new Error('El descuento no puede superar el subtotal.');
			}

			const orden = await client.query<{ client_id: ESRId | null }>(
				'SELECT client_id FROM work_orders WHERE company_id = $1 AND id = $2',
				[ctx.companyId, input.work_order_id]
			);
			if (!orden.rows[0]) throw new Error('La orden no existe en esta empresa.');

			const factura = await this.insertWithNumber(ctx, client, {
				work_order_id: input.work_order_id,
				client_id: orden.rows[0].client_id,
				date: input.date ?? null,
				subtotal,
				discount,
				total: round(subtotal - discount),
				notes: input.notes ?? null
			});

			for (const linea of lineas) {
				await this.invoices.insertItem(ctx, factura.id!, linea, client);
			}
			for (const conduceId of elegidas) {
				await this.invoices.linkConduce(ctx, factura.id!, conduceId, client);
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
	 * Une las lineas de varias entregas en una sola lista.
	 *
	 * Se agrupan por articulo Y precio: el mismo articulo entregado en dos tandas
	 * es una linea, pero si sale a dos precios distintos son dos, porque
	 * fusionarlas inventaria un precio que nadie acordo.
	 */
	private async aggregateLines(
		ctx: RepositoryContext,
		conduceIds: string[],
		client: pg.PoolClient
	): Promise<Aggregated[]> {
		const acumulado = new Map<string, Aggregated>();

		for (const conduceId of conduceIds) {
			const items = await this.conduces.listItems(ctx, conduceId, client);
			for (const item of items) {
				const price = round(Number(item.price ?? 0));
				const clave = `${item.item_id ?? 'libre'}|${price}`;
				const previo = acumulado.get(clave);
				if (previo) {
					previo.quantity = round(previo.quantity + Number(item.quantity ?? 0));
					continue;
				}
				acumulado.set(clave, {
					item_id: item.item_id ?? null,
					description: item.name ?? null,
					quantity: round(Number(item.quantity ?? 0)),
					price
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

/** Dos decimales: los importes son NUMERIC(12,2) y sumar flotantes deja restos. */
function round(value: number): number {
	return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
