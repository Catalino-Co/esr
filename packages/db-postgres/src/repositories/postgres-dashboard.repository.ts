import type { DashboardStats, DateRange, RepositoryContext, TenantDashboardRepository } from '@esr/core';
import { ACTIVE_INVENTORY_ORDER_STATUSES, RECORD_STATE, requireCompanyId } from '@esr/core';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

/**
 * Cotizacion «abierta»: todavia puede convertirse en trabajo. Las convertidas,
 * rechazadas, canceladas y vencidas ya no cuentan.
 */
const OPEN_QUOTE_STATUSES = ['borrador', 'enviada', 'aprobada'];

/**
 * Orden «activa». Se toma la constante del nucleo, la misma que gobierna el
 * stock comprometido: el dashboard tenia su propia lista, que ademas incluia
 * `devuelto` —una orden devuelta ya no esta en flujo—, asi que las dos partes
 * del sistema no contaban lo mismo.
 */
const ACTIVE_ORDER_STATUSES = [...ACTIVE_INVENTORY_ORDER_STATUSES];

/** Incidencia sin resolver. `IncidentStatus` solo admite estos tres valores. */
const OPEN_INCIDENT_STATUSES = ['reportado'];

export class PostgresDashboardRepository implements TenantDashboardRepository {
	constructor(private readonly pool: pg.Pool = getPostgresPool()) {}

	async stats(ctx: RepositoryContext, range: DateRange): Promise<DashboardStats> {
		const companyId = requireCompanyId(ctx);

		/**
		 * Las seis en una sola ida a la base. Cada subconsulta es un COUNT sobre
		 * su indice `(company_id, created_at)`, no un SELECT * medido en memoria.
		 *
		 * `created_at` es TIMESTAMPTZ y el rango llega como fecha: el limite
		 * superior va con `< to + 1 dia` para incluir el ultimo dia entero. Con
		 * `<= to` se perderia todo lo creado despues de medianoche.
		 */
		const result = await this.pool.query<{
			new_customers: string;
			inventory: string;
			events: string;
			open_quotes: string;
			active_orders: string;
			open_incidents: string;
		}>(
			`SELECT
				(SELECT COUNT(*) FROM clients
				  WHERE company_id = $1
				    AND created_at >= $2::date
				    AND created_at < ($3::date + INTERVAL '1 day'))::text AS new_customers,

				(SELECT COUNT(*) FROM items
				  WHERE company_id = $1 AND is_active = $6)::text AS inventory,

				-- events.date es TEXT, no DATE. El cast a ::text es obligatorio:
				-- el mismo parametro se usa como ::date en las otras subconsultas y
				-- PostgreSQL infiere UN solo tipo por parametro, asi que sin esto
				-- intenta comparar text >= date y no existe ese operador.
				(SELECT COUNT(*) FROM events
				  WHERE company_id = $1
				    AND date IS NOT NULL AND date <> ''
				    AND date >= $2::text AND date <= $3::text)::text AS events,

				(SELECT COUNT(*) FROM quotations
				  WHERE company_id = $1
				    AND created_at >= $2::date
				    AND created_at < ($3::date + INTERVAL '1 day')
				    AND status = ANY($4::text[]))::text AS open_quotes,

				(SELECT COUNT(*) FROM work_orders
				  WHERE company_id = $1
				    AND created_at >= $2::date
				    AND created_at < ($3::date + INTERVAL '1 day')
				    AND status = ANY($5::text[]))::text AS active_orders,

				(SELECT COUNT(*) FROM incidents
				  WHERE company_id = $1
				    AND created_at >= $2::date
				    AND created_at < ($3::date + INTERVAL '1 day')
				    AND status = ANY($7::text[]))::text AS open_incidents`,
			[
				companyId,
				range.from,
				range.to,
				OPEN_QUOTE_STATUSES,
				ACTIVE_ORDER_STATUSES,
				RECORD_STATE.ACTIVE,
				OPEN_INCIDENT_STATUSES
			]
		);

		const row = result.rows[0];
		return {
			newCustomers: Number(row?.new_customers ?? 0),
			inventory: Number(row?.inventory ?? 0),
			events: Number(row?.events ?? 0),
			openQuotes: Number(row?.open_quotes ?? 0),
			activeOrders: Number(row?.active_orders ?? 0),
			openIncidents: Number(row?.open_incidents ?? 0)
		};
	}
}
