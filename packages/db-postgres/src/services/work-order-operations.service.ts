import {
	canCloseOrder,
	getDeliverableQuantity,
	getReturnableQuantity,
	mapReturnConditionToItemStatus,
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
			// ya no esta disponible.
			const serialAssignments: Array<{ item_id: ESRId; serial_id: ESRId }> = [];

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
						serialAssignments.push({ item_id: woItem.item_id, serial_id: serialId });
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
			const conduceLines: Array<{ work_order_item_id: ESRId; item_id: ESRId; quantity: number; price?: number }> = [];
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
					price: woItem.price
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
							status: 'reportado'
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
