import type { RepositoryContext } from '../shared/tenant';

/**
 * Ventana de tiempo del dashboard, en fechas `YYYY-MM-DD` inclusivas.
 */
export type DateRange = { from: string; to: string };

/**
 * Las seis cifras de la franja.
 *
 * `inventory` es el unico STOCK: cuenta los articulos activos a dia de hoy y no
 * se acota al periodo, porque «articulos de los ultimos 30 dias» no significa
 * nada. Las otras cinco son FLUJO y si se acotan.
 */
export type DashboardStats = {
	/** Clientes dados de alta dentro del periodo. */
	newCustomers: number;
	/** Articulos activos, al dia de hoy. Sin acotar. */
	inventory: number;
	/** Eventos cuya FECHA cae dentro del periodo. `events` no tiene created_at. */
	events: number;
	/** Cotizaciones creadas en el periodo que siguen abiertas. */
	openQuotes: number;
	/** Ordenes creadas en el periodo que siguen en flujo operativo. */
	activeOrders: number;
	/** Incidencias creadas en el periodo que siguen sin resolver. */
	openIncidents: number;
};

export interface TenantDashboardRepository {
	/**
	 * Las seis cifras, con `COUNT` de verdad.
	 *
	 * Existe porque antes se calculaban con `.length` sobre una pagina de
	 * resultados: las de cotizaciones y ordenes median sobre 20 filas, o sea que
	 * respondian «cuantas de las 20 mas recientes estan abiertas», y las demas
	 * se quedaban clavadas en 500.
	 */
	stats(ctx: RepositoryContext, range: DateRange): Promise<DashboardStats>;
}
