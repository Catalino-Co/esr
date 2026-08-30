import {
	canCloseOrder,
	canRevertDeliveredQuantity,
	getDeliverableQuantity,
	getReturnableQuantity,
	mapReturnConditionToItemStatus,
	ORDER_STATUSES_FROZEN,
	recalcItemStatusAfterCancel,
	recalcOrderStatusAfterCancel,
	validateOrderTransition,
	type RepositoryContext
} from '@esr/core';
import type { ChecklistItem, ChecklistType, Conduce, ESRId, Incident, RentalOrder } from '@esr/schemas';
import { withTransaction } from '../transaction';
import { PostgresConduceRepository } from '../repositories/postgres-conduce.repository';
import {
	PostgresChecklistRepository,
	PostgresIncidentRepository,
	PostgresStockMovementRepository
} from '../repositories/postgres-operations.repository';
import { PostgresRentalRepository } from '../repositories/postgres-rental.repository';
import { PostgresSerialRepository } from '../repositories/postgres-package.repository';

export type DeliveryLineInput = {
	work_order_item_id: ESRId;
	quantity: number;
	/**
	 * Seriales concretos que salen. Solo aplica a articulos serializados; en
	 * ellos la cantidad entregada ES el numero de seriales elegidos.
	 */
	serial_ids?: ESRId[];
};

export type ReturnLineInput = {
	work_order_item_id: ESRId;
	quantity: number;
	condition: string;
	notes?: string;
	/** Seriales concretos que regresan; vuelven a quedar disponibles. */
	serial_ids?: ESRId[];
};

export class WorkOrderOperationsService {
	constructor(
		private readonly orders = new PostgresRentalRepository(),
		private readonly conduces = new PostgresConduceRepository(),
		private readonly checklists = new PostgresChecklistRepository(),
		private readonly incidents = new PostgresIncidentRepository(),
		private readonly stock = new PostgresStockMovementRepository(),
		private readonly serials = new PostgresSerialRepository()
	) {}

	async prepareOrder(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrder> {
		const order = await this.orders.findById(ctx, orderId);
		if (!order) throw new Error('Order not found in company.');
		const check = validateOrderTransition(order.status, ['confirmado']);
		if (!check.ok) throw new Error(check.error);

		await this.orders.changeStatus(ctx, orderId, 'en_preparacion');
		await this.orders.updateItemsStatus(ctx, orderId, 'preparado');
		return (await this.orders.findById(ctx, orderId))!;
	}

	async completeDelivery(
		ctx: RepositoryContext,
		orderId: ESRId,
		input: {
			lines: DeliveryLineInput[];
			received_by_name?: string;
			received_by_document?: string;
			notes?: string;
		}
	): Promise<{ order: RentalOrder; conduce: Conduce }> {
		return withTransaction(async (client) => {
			const order = await this.orders.findById(ctx, orderId);
			if (!order) throw new Error('Order not found in company.');
			const statusCheck = validateOrderTransition(order.status, ['confirmado', 'en_preparacion']);
			if (!statusCheck.ok) throw new Error(statusCheck.error);

			const items = await this.orders.listItems(ctx, orderId);
			const itemMap = new Map(items.map((item) => [String(item.id), item]));
			const conduceLines: Array<{ work_order_item_id: ESRId; item_id: ESRId; quantity: number; price?: number }> = [];

			// Seriales que salen en esta entrega, por linea. Se resuelven antes de
			// crear el conduce para poder abortar la transaccion entera si alguno
			// ya no esta disponible. `work_order_item_id` viaja con ellos porque
			// luego hay que colgarlos de la LINEA del conduce: es lo unico que
			// permite deshacer la entrega si el conduce se anula.
			const serialAssignments: Array<{
				work_order_item_id: ESRId;
				item_id: ESRId;
				serial_id: ESRId;
			}> = [];

			for (const line of input.lines) {
				const woItem = itemMap.get(String(line.work_order_item_id));
				if (!woItem?.id) throw new Error(`Work order item ${line.work_order_item_id} not found.`);
				const deliverable = getDeliverableQuantity(woItem);

				const serialIds = line.serial_ids ?? [];
				if (serialIds.length) {
					// En un articulo serializado la cantidad no se escribe: es
					// cuantas unidades concretas se eligieron.
					if (serialIds.length > deliverable) {
						throw new Error(
							`Se eligieron ${serialIds.length} seriales de ${woItem.name} pero solo quedan ${deliverable} por entregar.`
						);
					}

					const available = await this.serials.listAvailableForItem(ctx, woItem.item_id);
					const availableIds = new Set(available.map((serial) => String(serial.id)));
					for (const serialId of serialIds) {
						if (!availableIds.has(String(serialId))) {
							throw new Error(
								`El serial seleccionado de ${woItem.name} ya no está disponible. Vuelva a cargar la página.`
							);
						}
						serialAssignments.push({
							work_order_item_id: woItem.id,
							item_id: woItem.item_id,
							serial_id: serialId
						});
					}
				}

				const quantity = serialIds.length || line.quantity;
				if (quantity <= 0 || quantity > deliverable) {
					throw new Error(`Invalid delivery quantity for item ${woItem.name}. Max: ${deliverable}.`);
				}

				conduceLines.push({
					work_order_item_id: woItem.id,
					item_id: woItem.item_id,
					quantity,
					price: woItem.price
				});
			}

			if (!conduceLines.length) throw new Error('No delivery lines provided.');

			// Los seriales pasan a 'entregado' y quedan ligados a la orden. Va
			// dentro de la misma transaccion que el conduce: o sale todo o nada.
			for (const assignment of serialAssignments) {
				await client.query(
					`INSERT INTO work_order_item_serials (company_id, work_order_id, item_id, serial_id)
					 VALUES ($1, $2, $3, $4)
					 ON CONFLICT (work_order_id, serial_id) DO NOTHING`,
					[ctx.companyId, orderId, assignment.item_id, assignment.serial_id]
				);
				await client.query(
					`UPDATE item_serials SET status = 'entregado'
					 WHERE company_id = $1 AND id = $2`,
					[ctx.companyId, assignment.serial_id]
				);
			}

			const conduce = await this.conduces.create(
				ctx,
				{
					work_order_id: orderId,
					client_id: order.client_id,
					conduce_type: 'entrega',
					notes: input.notes,
					items: conduceLines
				},
				client
			);

			// Los seriales se cuelgan del conduce DESPUES de crearlo, que es cuando
			// existen los ids de sus lineas.
			for (const assignment of serialAssignments) {
				await this.conduces.linkSerial(
					ctx,
					{
						conduce_id: conduce.id!,
						conduce_item_id: conduce.line_ids.get(String(assignment.work_order_item_id)),
						item_id: assignment.item_id,
						serial_id: assignment.serial_id
					},
					client
				);
			}

			await this.conduces.complete(
				ctx,
				conduce.id!,
				{
					received_by_name: input.received_by_name,
					received_by_document: input.received_by_document,
					notes: input.notes
				},
				client
			);

			for (const line of conduceLines) {
				const woItem = itemMap.get(String(line.work_order_item_id))!;
				const newDelivered = Number(woItem.delivered_quantity || 0) + line.quantity;
				const newStatus = newDelivered >= Number(woItem.quantity || 0) ? 'entregado' : 'preparado';
				woItem.delivered_quantity = newDelivered;
				woItem.status = newStatus;
				await this.orders.updateItemQuantities(ctx, orderId, line.work_order_item_id, {
					delivered_quantity: newDelivered,
					status: newStatus
				}, client);
				await this.stock.create(
					ctx,
					{
						item_id: line.item_id,
						work_order_id: orderId,
						work_order_item_id: line.work_order_item_id,
						movement_type: 'delivered',
						quantity: line.quantity,
						reference_type: 'conduce',
						reference_id: conduce.id,
						notes: input.notes
					},
					client
				);
			}

			const allDelivered = [...itemMap.values()].every(
				(item) => Number(item.delivered_quantity || 0) >= Number(item.quantity || 0)
			);
			const updatedOrder = await this.orders.changeStatus(ctx, orderId, allDelivered ? 'entregado' : 'en_preparacion', client);

			return { order: updatedOrder, conduce };
		});
	}

	async completeReturn(
		ctx: RepositoryContext,
		orderId: ESRId,
		input: { lines: ReturnLineInput[]; notes?: string }
	): Promise<{ order: RentalOrder; conduce: Conduce; incidents: Incident[] }> {
		return withTransaction(async (client) => {
			const order = await this.orders.findById(ctx, orderId);
			if (!order) throw new Error('Order not found in company.');
			const statusCheck = validateOrderTransition(order.status, ['entregado', 'parcialmente_devuelto']);
			if (!statusCheck.ok) throw new Error(statusCheck.error);

			const items = await this.orders.listItems(ctx, orderId);
			const itemMap = new Map(items.map((item) => [String(item.id), item]));
			const conduceLines: Array<{
				work_order_item_id: ESRId;
				item_id: ESRId;
				quantity: number;
				price?: number;
				return_condition?: string;
			}> = [];
			const createdIncidents: Incident[] = [];

			for (const line of input.lines) {
				const woItem = itemMap.get(String(line.work_order_item_id));
				if (!woItem?.id) throw new Error(`Work order item ${line.work_order_item_id} not found.`);
				const returnable = getReturnableQuantity(woItem);
				if (line.quantity <= 0 || line.quantity > returnable) {
					throw new Error(`Invalid return quantity for ${woItem.name}. Max: ${returnable}.`);
				}
				conduceLines.push({
					work_order_item_id: woItem.id,
					item_id: woItem.item_id,
					quantity: line.quantity,
					price: woItem.price,
					// La condicion se guarda en la LINEA, no solo en el estado del
					// articulo. Con varias devoluciones parciales, revertir una sin
					// esto dejaria el estado del articulo sin con que recalcularse.
					return_condition: line.condition
				});
			}

			if (!conduceLines.length) throw new Error('No return lines provided.');

			// Los seriales devueltos vuelven a 'disponible' y se sueltan de la
			// orden. Si la unidad regresa dañada, la incidencia queda registrada
			// aparte: el serial no se marca en mantenimiento automaticamente,
			// porque eso lo decide quien la revisa.
			const returningSerials = input.lines.flatMap((line) => line.serial_ids ?? []);
			for (const serialId of returningSerials) {
				await client.query(
					`UPDATE item_serials SET status = 'disponible'
					 WHERE company_id = $1 AND id = $2 AND status = 'entregado'`,
					[ctx.companyId, serialId]
				);
				await client.query(
					`DELETE FROM work_order_item_serials
					 WHERE company_id = $1 AND work_order_id = $2 AND serial_id = $3`,
					[ctx.companyId, orderId, serialId]
				);
			}

			const conduce = await this.conduces.create(
				ctx,
				{
					work_order_id: orderId,
					client_id: order.client_id,
					conduce_type: 'devolucion',
					notes: input.notes,
					items: conduceLines
				},
				client
			);
			for (const line of input.lines) {
				for (const serialId of line.serial_ids ?? []) {
					const woItem = itemMap.get(String(line.work_order_item_id))!;
					await this.conduces.linkSerial(
						ctx,
						{
							conduce_id: conduce.id!,
							conduce_item_id: conduce.line_ids.get(String(line.work_order_item_id)),
							item_id: woItem.item_id,
							serial_id: serialId
						},
						client
					);
				}
			}

			await this.conduces.complete(ctx, conduce.id!, { notes: input.notes }, client);

			for (const line of input.lines) {
				const woItem = itemMap.get(String(line.work_order_item_id))!;
				const itemStatus = mapReturnConditionToItemStatus(line.condition);
				const newReturned = Number(woItem.returned_quantity || 0) + line.quantity;
				woItem.returned_quantity = newReturned;
				woItem.status = itemStatus;

				await this.orders.updateItemQuantities(ctx, orderId, line.work_order_item_id, {
					returned_quantity: newReturned,
					status: itemStatus
				}, client);

				const movementType =
					itemStatus === 'dañado' ? 'damaged' : itemStatus === 'perdido' ? 'lost' : 'returned';
				await this.stock.create(
					ctx,
					{
						item_id: woItem.item_id,
						work_order_id: orderId,
						work_order_item_id: line.work_order_item_id,
						movement_type: movementType,
						quantity: line.quantity,
						reference_type: 'conduce',
						reference_id: conduce.id,
						notes: line.notes
					},
					client
				);

				if (itemStatus === 'dañado' || itemStatus === 'perdido') {
					const incident = await this.incidents.create(
						ctx,
						{
							type: itemStatus === 'dañado' ? 'daño' : 'faltante',
							item_id: woItem.item_id,
							client_id: order.client_id,
							work_order_id: orderId,
							description: line.notes || `Incidencia en devolución: ${woItem.name} (${itemStatus})`,
							severity: itemStatus === 'perdido' ? 'alta' : 'media',
							status: 'reportado',
							// Sin esto, anular la devolucion no sabria que incidencias creo.
							conduce_id: conduce.id
						},
						client
					);
					createdIncidents.push(incident);
				}
			}

			const allReturned = [...itemMap.values()].every((item) => {
				const delivered = Number(item.delivered_quantity || 0);
				const returned = Number(item.returned_quantity || 0);
				return returned >= delivered || ['dañado', 'perdido'].includes(String(item.status || ''));
			});
			const updatedOrder = await this.orders.changeStatus(ctx, orderId, allReturned ? 'devuelto' : 'parcialmente_devuelto', client);

			return {
				order: updatedOrder,
				conduce,
				incidents: createdIncidents
			};
		});
	}

	/**
	 * Anula un conduce, en uno de dos modos.
	 *
	 *   `documento`  — la entrega ocurrio; lo que se retira es el papel. Nada de
	 *                  la operacion se toca.
	 *   `operacion`  — la entrega NO ocurrio. Se deshacen sus efectos, todos en
	 *                  esta misma transaccion: o vuelven todos o no vuelve
	 *                  ninguno.
	 *
	 * Los dos modos venian del plan de cuando el conduce era el documento de
	 * dinero, y se llamaban `comercial` y `error`. La factura se llevo el dinero
	 * en la migracion 012, asi que hoy la distincion util es documento contra
	 * operacion.
	 */
	async cancelConduce(
		ctx: RepositoryContext,
		conduceId: ESRId,
		input: { mode: 'documento' | 'operacion'; reason: string }
	): Promise<{ conduce: Conduce; order: RentalOrder | null; voidedIncidents: number }> {
		return withTransaction(async (client) => {
			const conduce = await this.conduces.findById(ctx, conduceId, client);
			if (!conduce) throw new Error('El conduce no existe en esta empresa.');
			if (conduce.status === 'anulado') throw new Error('Este conduce ya estaba anulado.');

			// Anular por detras de una factura viva dejaria cobrandose una entrega
			// que ya no ocurrio. Se anula antes la factura, que libera la entrega.
			const factura = await this.conduces.billedBy(ctx, conduceId, client);
			if (factura) {
				throw new Error(
					`No se puede anular: la factura ${factura.invoice_number} lo cubre. Anule primero la factura, que liberará esta entrega.`
				);
			}

			if (input.mode === 'documento') {
				const anulado = await this.conduces.cancel(ctx, conduceId, input, client);
				return { conduce: anulado, order: null, voidedIncidents: 0 };
			}

			const esDevolucion = conduce.conduce_type === 'devolucion';
			const lineas = await this.conduces.listItems(ctx, conduceId, client);
			if (!lineas.length) throw new Error('El conduce no tiene líneas que deshacer.');

			const order = await this.orders.findById(ctx, conduce.work_order_id);
			if (!order) throw new Error('La orden del conduce no existe.');
			if (ORDER_STATUSES_FROZEN.includes(order.status as (typeof ORDER_STATUSES_FROZEN)[number])) {
				throw new Error(
					`La orden está ${order.status} y ya no admite cambios hacia atrás. Reábrala antes de deshacer la operación.`
				);
			}

			// ── Lo que no se puede deshacer se rechaza ANTES de tocar nada ────
			//
			// Un conduce anterior a la migracion 013 puede no tener registrado que
			// unidades movio ni con que condicion volvieron. Deshacerlo a ojo seria
			// peor que negarse.
			const serialesDelConduce = await this.conduces.listSerials(ctx, conduceId, client);
			const serializados = await client.query<{ item_id: ESRId; name: string }>(
				`SELECT DISTINCT ci.item_id, i.name
				 FROM conduce_items ci
				 JOIN items i ON i.id = ci.item_id AND i.company_id = ci.company_id
				 WHERE ci.company_id = $1 AND ci.conduce_id = $2 AND i.item_type = 'serializado'`,
				[ctx.companyId, conduceId]
			);
			const conSerial = new Set(serialesDelConduce.map((fila) => String(fila.item_id)));
			const sinRastro = serializados.rows.filter((fila) => !conSerial.has(String(fila.item_id)));
			if (sinRastro.length) {
				throw new Error(
					`No se puede deshacer: no consta qué unidades concretas movió este conduce de ${sinRastro
						.map((fila) => fila.name)
						.join(', ')}. Es anterior al registro de seriales por documento.`
				);
			}

			if (esDevolucion && lineas.some((linea) => !linea.return_condition)) {
				throw new Error(
					'No se puede deshacer: esta devolución no registró con qué condición volvió cada línea. Es anterior al registro por documento.'
				);
			}

			const items = await this.orders.listItems(ctx, conduce.work_order_id);
			const itemMap = new Map(items.map((item) => [String(item.id), item]));

			// Lo que quedara en cada linea, calculado ANTES de escribir nada.
			const nuevos = new Map<string, { delivered: number; returned: number; quantity: number | string }>();
			for (const linea of lineas) {
				const woItem = itemMap.get(String(linea.work_order_item_id));
				if (!woItem?.id) throw new Error('Una línea del conduce ya no corresponde a la orden.');
				const cantidad = Number(linea.quantity || 0);
				const delivered = Number(woItem.delivered_quantity || 0);
				const returned = Number(woItem.returned_quantity || 0);

				if (esDevolucion) {
					if (returned - cantidad < 0) {
						throw new Error(`Las cantidades de ${woItem.name} no cuadran: no se puede deshacer.`);
					}
					nuevos.set(String(woItem.id), {
						delivered,
						returned: returned - cantidad,
						quantity: woItem.quantity
					});
				} else {
					const check = canRevertDeliveredQuantity({ delivered, returned }, cantidad);
					if (!check.ok) {
						throw new Error(
							check.error === 'conduce.revert.returned_first'
								? `No se puede deshacer la entrega de ${woItem.name}: parte ya se devolvió. Anule antes la devolución.`
								: `Las cantidades de ${woItem.name} no cuadran: no se puede deshacer.`
						);
					}
					nuevos.set(String(woItem.id), {
						delivered: delivered - cantidad,
						returned,
						quantity: woItem.quantity
					});
				}
			}

			// ── A partir de aqui se escribe ──────────────────────────────────
			for (const [woItemId, cifras] of nuevos) {
				const condiciones = await this.conduces.listLiveReturnConditions(ctx, woItemId, conduceId, client);
				const estado = recalcItemStatusAfterCancel(cifras, condiciones);
				await this.orders.updateItemQuantities(
					ctx,
					conduce.work_order_id,
					woItemId,
					{ delivered_quantity: cifras.delivered, returned_quantity: cifras.returned, status: estado },
					client
				);
			}

			// Los seriales vuelven al estado del que salieron.
			for (const fila of serialesDelConduce) {
				if (esDevolucion) {
					// La devolucion los habia liberado: vuelven a estar en la calle.
					await client.query(
						`UPDATE item_serials SET status = 'entregado' WHERE company_id = $1 AND id = $2`,
						[ctx.companyId, fila.serial_id]
					);
					await client.query(
						`INSERT INTO work_order_item_serials (company_id, work_order_id, item_id, serial_id)
						 VALUES ($1, $2, $3, $4) ON CONFLICT (work_order_id, serial_id) DO NOTHING`,
						[ctx.companyId, conduce.work_order_id, fila.item_id, fila.serial_id]
					);
				} else {
					await client.query(
						`UPDATE item_serials SET status = 'disponible' WHERE company_id = $1 AND id = $2`,
						[ctx.companyId, fila.serial_id]
					);
					await client.query(
						`DELETE FROM work_order_item_serials
						 WHERE company_id = $1 AND work_order_id = $2 AND serial_id = $3`,
						[ctx.companyId, conduce.work_order_id, fila.serial_id]
					);
				}
			}

			// `stock_movements` es bitacora: no se borra, se compensa. Cada
			// movimiento del conduce recibe su contrario, del mismo tamaño.
			const movimientos = await this.conduces.listStockMovements(ctx, conduceId, client);
			for (const movimiento of movimientos) {
				await this.stock.create(
					ctx,
					{
						item_id: movimiento.item_id,
						work_order_id: conduce.work_order_id,
						work_order_item_id: movimiento.work_order_item_id ?? undefined,
						movement_type: `reverso_${movimiento.type}`,
						quantity: movimiento.quantity,
						reference_type: 'conduce',
						reference_id: conduceId,
						notes: `Anulación de ${conduce.note_number}: ${input.reason}`
					},
					client
				);
			}

			// Si la devolucion no ocurrio, el daño que reporto tampoco.
			const voidedIncidents = await this.incidents.voidByConduce(ctx, conduceId, client);

			const anulado = await this.conduces.cancel(ctx, conduceId, input, client);

			const paraOrden = items.map((item) => {
				const cifras = nuevos.get(String(item.id));
				return {
					quantity: item.quantity,
					delivered: cifras ? cifras.delivered : Number(item.delivered_quantity || 0),
					returned: cifras ? cifras.returned : Number(item.returned_quantity || 0)
				};
			});
			const updatedOrder = await this.orders.changeStatus(
				ctx,
				conduce.work_order_id,
				recalcOrderStatusAfterCancel(paraOrden),
				client
			);

			return { conduce: anulado, order: updatedOrder, voidedIncidents };
		});
	}

	async saveChecklist(ctx: RepositoryContext, orderId: ESRId, type: ChecklistType, items: ChecklistItem[]): Promise<void> {
		const order = await this.orders.findById(ctx, orderId);
		if (!order) throw new Error('Order not found in company.');
		await this.checklists.replaceForWorkOrder(ctx, orderId, type, items);
	}

	async createIncident(ctx: RepositoryContext, data: Omit<Incident, 'id' | 'company_id'>): Promise<Incident> {
		const order = await this.orders.findById(ctx, data.work_order_id as ESRId);
		if (!order) throw new Error('Order not found in company.');
		if (data.item_id) {
			const items = await this.orders.listItems(ctx, data.work_order_id as ESRId);
			if (!items.some((item) => String(item.item_id) === String(data.item_id))) {
				throw new Error('Item does not belong to this order.');
			}
		}
		return this.incidents.create(ctx, data);
	}

	async resolveIncident(ctx: RepositoryContext, incidentId: ESRId): Promise<Incident> {
		return this.incidents.resolve(ctx, incidentId);
	}

	async closeOrder(ctx: RepositoryContext, orderId: ESRId): Promise<RentalOrder> {
		const order = await this.orders.findById(ctx, orderId);
		if (!order) throw new Error('Order not found in company.');
		const statusCheck = validateOrderTransition(order.status, ['devuelto']);
		if (!statusCheck.ok) throw new Error(statusCheck.error);
		const items = await this.orders.listItems(ctx, orderId);
		const openIncidents = await this.incidents.countOpenByWorkOrder(ctx, orderId);
		const check = canCloseOrder(items, openIncidents);
		if (!check.ok) throw new Error(check.error);
		return this.orders.closeOrder(ctx, orderId);
	}
}
