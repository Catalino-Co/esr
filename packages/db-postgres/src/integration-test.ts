import assert from 'node:assert/strict';
import type { RepositoryContext } from '@esr/core';
import { closePostgresPool, getPostgresPool } from './connection';
import { PostgresCustomerRepository } from './repositories/postgres-customer.repository';
import { PostgresEventRepository } from './repositories/postgres-event.repository';
import { PostgresInventoryRepository } from './repositories/postgres-inventory.repository';

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
		"SELECT to_regclass('public.schema_migrations')::text AS table_name"
	);
	assert.equal(migrationsTable.rows[0].table_name, 'schema_migrations');
	const migrationCount = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM schema_migrations');
	assert.ok(Number(migrationCount.rows[0].count) >= 2, 'Expected Phase 1 migrations to be applied.');
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
	assert.ok(inventoryA.some((row) => row.name === 'Equipo Demo A'));
	assert.ok(inventoryB.some((row) => row.name === 'Equipo Demo B'));
	assert.equal(await inventory.findById(ctxA, inventoryB[0].id!), null);
	assert.equal(await inventory.findById(ctxB, inventoryA[0].id!), null);
	console.log('[ok] inventory items are isolated by company_id');

	const eventsA = await events.list(ctxA, { search: 'Evento Demo', limit: 20, offset: 0 });
	const eventsB = await events.list(ctxB, { search: 'Evento Demo', limit: 20, offset: 0 });
	assertScoped(eventsA, companyA.id, 'events A');
	assertScoped(eventsB, companyB.id, 'events B');
	assert.ok(eventsA.some((row) => row.name === 'Evento Demo A'));
	assert.ok(eventsB.some((row) => row.name === 'Evento Demo B'));
	assert.equal(await events.findById(ctxA, eventsB[0].id!), null);
	assert.equal(await events.findById(ctxB, eventsA[0].id!), null);
	console.log('[ok] events are isolated by company_id');

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
