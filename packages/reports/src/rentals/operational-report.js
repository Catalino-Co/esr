/**
 * El resumen del panel de reportes de ESR Pro.
 *
 * Los tipos van a `any` y no a formas concretas: cada campo acepta DOS nombres
 * —`rented_times` o `rentedTimes`, `estimated_cost` o `estimatedCost`— porque
 * lo alimentan consultas escritas en dos epocas. Describir eso con un tipo
 * seria mas ruido que ayuda.
 *
 * @param {any} input
 */
export function createOperationalDashboardReport(input = {}) {
	const quotationStats = input.quotationStats || {};
	const workOrderStats = input.workOrderStats || {};
	const incidentStats = input.incidentStats || {};

	return {
		summary: {
			totalQuotations: Number(input.totalQuotations ?? quotationStats.cnt ?? 0),
			totalWorkOrders: Number(input.totalWorkOrders ?? workOrderStats.cnt ?? 0),
			totalRevenue: Number(quotationStats.revenue ?? input.totalRevenue ?? 0),
			totalIncidents: Number(incidentStats.cnt ?? input.totalIncidents ?? 0),
			incidentsCost: Number(incidentStats.cost ?? input.incidentsCost ?? 0)
		},
		topItems: (input.topItems || []).map((/** @type {any} */ item) => ({
			name: item.name || '',
			internal_code: item.internal_code || item.code || '',
			rented_times: Number(item.rented_times ?? item.rentedTimes ?? 0)
		})),
		recentIncidents: (input.recentIncidents || []).map((/** @type {any} */ incident) => ({
			...incident,
			estimated_cost: Number(incident.estimated_cost ?? incident.estimatedCost ?? 0),
			item_name: incident.item_name || incident.itemName || ''
		}))
	};
}

