import assert from 'node:assert/strict';
import type { RepositoryContext } from '@esr/core';
import { closePostgresPool, getPostgresPool } from './connection';
import { ESR_CLOUD_SCHEMA } from './schema';
import { PostgresCustomerRepository } from './repositories/postgres-customer.repository';
import { PostgresEventRepository } from './repositories/postgres-event.repository';
import { PostgresInventoryRepository } from './repositories/postgres-inventory.repository';
import { PostgresQuoteRepository } from './repositories/postgres-quote.repository';
import { PostgresRentalRepository } from './repositories/postgres-rental.repository';
import { PostgresConduceRepository } from './repositories/postgres-conduce.repository';
import { PostgresIncidentRepository } from './repositories/postgres-operations.repository';
import { QuoteConversionService } from './services/quote-conversion.service';
import { WorkOrderOperationsService } from './services/work-order-operations.service';

type CompanyRow = { id: string; slug: string };
type ScopedRow = { id?: number | string | null; company_id?: string };

function assertScoped(rows: ScopedRow[], companyId: string, label: string): void {
	assert.ok(rows.length > 0, `${label}: expected at least one seeded row.`);
	assert.ok(
		rows.every((row) => row.company_id === companyId),
		`${label}: repository returned a row from another company.`
	);
}

async function runIntegrationTest(): Promise<void> {
	const pool = getPostgresPool();
	await pool.query('SELECT 1');
	console.log('[ok] connected to PostgreSQL');

	const migrationsTable = await pool.query<{ table_name: string | null }>(
		`SELECT to_regclass('${ESR_CLOUD_SCHEMA}.schema_migrations')::text AS table_name`
	);
	assert.equal(migrationsTable.rows[0].table_name, 'schema_migrations');
	const migrationCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
	assert.ok(Number(migrationCount.rows[0].count) >= 5, 'Expected migrations through operations to be applied.');
	console.log('[ok] migrations table exists and contains applied migrations');

	const companiesResult = await pool.query<CompanyRow>(
		"SELECT id, slug FROM companies WHERE slug IN ('demo-a', 'demo-b') ORDER BY slug"
	);
	assert.equal(companiesResult.rows.length, 2, 'Run the multi-company seed before this test.');
	const companyA = companiesResult.rows.find((company) => company.slug === 'demo-a');
	const companyB = companiesResult.rows.find((company) => company.slug === 'demo-b');
	assert.ok(companyA && companyB);
	console.log('[ok] demo companies found');

	const ctxA: RepositoryContext = { companyId: companyA.id };
	const ctxB: RepositoryContext = { companyId: companyB.id };
	const customers = new PostgresCustomerRepository(pool);
	const inventory = new PostgresInventoryRepository(pool);
	const events = new PostgresEventRepository(pool);
	const quotes = new PostgresQuoteRepository(pool);
	const orders = new PostgresRentalRepository(pool);
	const conversion = new QuoteConversionService(quotes, orders);
	const operations = new WorkOrderOperationsService();
	const conduces = new PostgresConduceRepository(pool);
	const incidents = new PostgresIncidentRepository(pool);

	const customersA = await customers.list(ctxA, { search: 'Cliente Demo', limit: 20, offset: 0 });
	const customersB = await customers.list(ctxB, { search: 'Cliente Demo', limit: 20, offset: 0 });
	assertScoped(customersA, companyA.id, 'customers A');
	assertScoped(customersB, companyB.id, 'customers B');
	assert.ok(customersA.some((row) => row.name === 'Cliente Demo A'));
	assert.ok(customersB.some((row) => row.name === 'Cliente Demo B'));
	assert.equal(await customers.findById(ctxA, customersB[0].id!), null);
	assert.equal(await customers.findById(ctxB, customersA[0].id!), null);
	console.log('[ok] customers are isolated by company_id');

	const inventoryA = await inventory.list(ctxA, { search: 'Equipo Demo', limit: 20, offset: 0 });
	const inventoryB = await inventory.list(ctxB, { search: 'Equipo Demo', limit: 20, offset: 0 });
	assertScoped(inventoryA, companyA.id, 'inventory A');
	assertScoped(inventoryB, companyB.id, 'inventory B');
	assert.equal(await inventory.findById(ctxA, inventoryB[0].id!), null);
	assert.equal(await inventory.findById(ctxB, inventoryA[0].id!), null);
	console.log('[ok] inventory items are isolated by company_id');

	const eventsA = await events.list(ctxA, { search: 'Evento Demo', limit: 20, offset: 0 });
	const eventsB = await events.list(ctxB, { search: 'Evento Demo', limit: 20, offset: 0 });
	assertScoped(eventsA, companyA.id, 'events A');
	assertScoped(eventsB, companyB.id, 'events B');
	assert.equal(await events.findById(ctxA, eventsB[0].id!), null);
	assert.equal(await events.findById(ctxB, eventsA[0].id!), null);
	console.log('[ok] events are isolated by company_id');

	const eventA = eventsA[0];
	const itemA = inventoryA[0];
	const quoteA = await quotes.create(ctxA, {
		client_id: customersA[0].id!,
		event_id: eventA.id!,
		status: 'borrador',
		items: []
	});
	await quotes.addItem(ctxA, quoteA.id!, { item_id: itemA.id!, quantity: 1, price: 100 });
	await quotes.changeStatus(ctxA, quoteA.id!, 'aprobada');
	const { order: orderA } = await conversion.convertToWorkOrder(ctxA, quoteA.id!);

	const quotesB = await quotes.list(ctxB, { limit: 50, offset: 0 });
	assert.ok(!quotesB.some((row) => row.id === quoteA.id));
	assert.equal(await quotes.findById(ctxB, quoteA.id!), null);
	console.log('[ok] quotes are isolated by company_id');

	const ordersB = await orders.list(ctxB, { limit: 50, offset: 0 });
	assert.ok(!ordersB.some((row) => row.id === orderA.id));
	assert.equal(await orders.findById(ctxB, orderA.id!), null);
	console.log('[ok] work orders are isolated by company_id');

	await operations.prepareOrder(ctxA, orderA.id!);
	const prepared = await orders.findById(ctxA, orderA.id!);
	assert.equal(prepared?.status, 'en_preparacion');

	const { conduce: deliveryConduce } = await operations.completeDelivery(ctxA, orderA.id!, {
		lines: [{ work_order_item_id: (await orders.listItems(ctxA, orderA.id!))[0].id!, quantity: 1 }],
		received_by_name: 'Receptor Demo'
	});
	assert.ok(deliveryConduce.note_number?.startsWith('CON-'));
	const delivered = await orders.findById(ctxA, orderA.id!);
	assert.equal(delivered?.status, 'entregado');

	const conducesB = await conduces.list(ctxB, { limit: 50, offset: 0 });
	assert.ok(!conducesB.some((row) => row.id === deliveryConduce.id));
	console.log('[ok] conduces are isolated by company_id');

	const { conduce: returnConduce, incidents: autoIncidents } = await operations.completeReturn(ctxA, orderA.id!, {
		lines: [{
			work_order_item_id: (await orders.listItems(ctxA, orderA.id!))[0].id!,
			quantity: 1,
			condition: 'good'
		}]
	});
	assert.ok(returnConduce.note_number?.startsWith('DEV-'));
	assert.equal(autoIncidents.length, 0);
	const returned = await orders.findById(ctxA, orderA.id!);
	assert.equal(returned?.status, 'devuelto');

	await operations.closeOrder(ctxA, orderA.id!);
	const closed = await orders.findById(ctxA, orderA.id!);
	assert.equal(closed?.status, 'cerrado');

	const incidentsA = await incidents.findByWorkOrderId(ctxA, orderA.id!);
	const incidentsB = await incidents.list(ctxB, { limit: 50, offset: 0 });
	assert.ok(!incidentsB.some((row) => incidentsA.some((a) => a.id === row.id)));
	console.log('[ok] operational flow and incident isolation passed');

	console.log('[ok] multi-company isolation test passed');
}

try {
	await runIntegrationTest();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[db-postgres] Integration test failed: ${message}`);
	process.exitCode = 1;
} finally {
	await closePostgresPool();
}
