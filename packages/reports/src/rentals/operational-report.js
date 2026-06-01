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
		topItems: (input.topItems || []).map((item) => ({
			name: item.name || '',
			internal_code: item.internal_code || item.code || '',
			rented_times: Number(item.rented_times ?? item.rentedTimes ?? 0)
		})),
		recentIncidents: (input.recentIncidents || []).map((incident) => ({
			...incident,
			estimated_cost: Number(incident.estimated_cost ?? incident.estimatedCost ?? 0),
			item_name: incident.item_name || incident.itemName || ''
		}))
	};
}

