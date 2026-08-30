import './load-env.js';
import bcrypt from 'bcryptjs';
import type pg from 'pg';
import { closePostgresPool, getPostgresPool } from './connection';

/** Development-only demo password. Never use in production. */
const DEMO_PASSWORD = 'admin123';
const DEMO_PASSWORD_ROUNDS = 10;

type DemoTenant = {
	companyName: string;
	slug: string;
	adminName: string;
	email: string;
	customerName: string;
	categoryName: string;
	itemName: string;
	itemCode: string;
	eventName: string;
};

/**
 * Miembros extra por empresa para poder probar la matriz de roles de Fase 8a.
 * Comparten la contrasena demo y solo existen en desarrollo local.
 */
type DemoMember = { name: string; emailPrefix: string; role: 'manager' | 'staff' | 'viewer' };

const demoMembers: DemoMember[] = [
	{ name: 'Gerente Demo', emailPrefix: 'gerente', role: 'manager' },
	{ name: 'Operador Demo', emailPrefix: 'operador', role: 'staff' },
	{ name: 'Lector Demo', emailPrefix: 'lector', role: 'viewer' }
];

const tenants: DemoTenant[] = [
	{
		companyName: 'Demo Company A', slug: 'demo-a', adminName: 'Admin A',
		email: 'admin-a@demo.local', customerName: 'Cliente Demo A',
		categoryName: 'Categoria Demo A', itemName: 'Equipo Demo A', itemCode: 'DEMO-A-001',
		eventName: 'Evento Demo A'
	},
	{
		companyName: 'Demo Company B', slug: 'demo-b', adminName: 'Admin B',
		email: 'admin-b@demo.local', customerName: 'Cliente Demo B',
		categoryName: 'Categoria Demo B', itemName: 'Equipo Demo B', itemCode: 'DEMO-B-001',
		eventName: 'Evento Demo B'
	}
];

async function upsertDemoTenant(client: pg.PoolClient, tenant: DemoTenant, passwordHash: string): Promise<void> {
	const companyResult = await client.query<{ id: string }>(
		`INSERT INTO companies (name, slug, status)
		 VALUES ($1, $2, 'active')
		 ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = NOW()
		 RETURNING id`,
		[tenant.companyName, tenant.slug]
	);
	const companyId = companyResult.rows[0].id;

	const userResult = await client.query<{ id: number }>(
		`INSERT INTO users (name, email, password_hash, status)
		 VALUES ($1, $2, $3, 'active')
		 ON CONFLICT (email) DO UPDATE
		 SET name = EXCLUDED.name,
		     status = 'active',
		     password_hash = EXCLUDED.password_hash,
		     updated_at = NOW()
		 RETURNING id`,
		[tenant.adminName, tenant.email, passwordHash]
	);
	const userId = userResult.rows[0].id;

	await client.query(
		`INSERT INTO company_members (company_id, user_id, role, status)
		 VALUES ($1, $2, 'owner', 'active')
		 ON CONFLICT (company_id, user_id)
		 DO UPDATE SET role = 'owner', status = 'active', updated_at = NOW()`,
		[companyId, userId]
	);

	for (const member of demoMembers) {
		const email = `${member.emailPrefix}-${tenant.slug.replace('demo-', '')}@demo.local`;
		const memberUser = await client.query<{ id: number }>(
			`INSERT INTO users (name, email, password_hash, status)
			 VALUES ($1, $2, $3, 'active')
			 ON CONFLICT (email) DO UPDATE
			 SET name = EXCLUDED.name,
			     status = 'active',
			     password_hash = EXCLUDED.password_hash,
			     updated_at = NOW()
			 RETURNING id`,
			[member.name, email, passwordHash]
		);
		await client.query(
			`INSERT INTO company_members (company_id, user_id, role, status)
			 VALUES ($1, $2, $3, 'active')
			 ON CONFLICT (company_id, user_id)
			 DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
			[companyId, memberUser.rows[0].id, member.role]
		);
	}

	// Catalogos base (Fase 8b). Sin ellos la app arranca sin nada que elegir
	// al crear un evento o clasificar un articulo.
	const eventTypes = [
		['Boda', '#e11d48'],
		['Corporativo', '#2563eb'],
		['Cumpleanos', '#f59e0b'],
		['Concierto', '#7c3aed']
	];
	for (const [name, color] of eventTypes) {
		await client.query(
			`INSERT INTO event_types (company_id, name, color, is_active)
			 VALUES ($1, $2, $3, 1)
			 ON CONFLICT DO NOTHING`,
			[companyId, name, color]
		);
	}

	const catalogTree: Array<[string, string, string[]]> = [
		['Sonido', '#2563eb', ['Bocinas', 'Consolas', 'Microfonos']],
		['Iluminacion', '#f59e0b', ['Luces LED', 'Seguidores']],
		['Mobiliario', '#10b981', ['Sillas', 'Mesas', 'Carpas']]
	];
	for (const [name, color, children] of catalogTree) {
		const category = await client.query<{ id: number }>(
			`INSERT INTO categories (company_id, name, color, is_active)
			 VALUES ($1, $2, $3, 1)
			 ON CONFLICT DO NOTHING
			 RETURNING id`,
			[companyId, name, color]
		);
		const categoryId =
			category.rows[0]?.id ??
			(
				await client.query<{ id: number }>(
					'SELECT id FROM categories WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER($2)',
					[companyId, name]
				)
			).rows[0].id;

		for (const child of children) {
			await client.query(
				`INSERT INTO subcategories (company_id, category_id, name, is_active)
				 VALUES ($1, $2, $3, 1)
				 ON CONFLICT DO NOTHING`,
				[companyId, categoryId, child]
			);
		}
	}

	await client.query(
		`INSERT INTO suppliers (company_id, name, service, contact, phone, is_active)
		 VALUES ($1, 'Proveedor Demo', 'Transporte', 'Contacto Demo', '809-000-0001', 1)
		 ON CONFLICT DO NOTHING`,
		[companyId]
	);

	await client.query(
		`INSERT INTO collaborators (company_id, name, role, phone, is_active)
		 VALUES ($1, 'Colaborador Demo', 'Tecnico', '809-000-0002', 1)
		 ON CONFLICT DO NOTHING`,
		[companyId]
	);

	// Sectores comerciales y tipos de direccion. Van sembrados por el mismo
	// motivo que los de arriba: un desplegable vacio parece una pantalla rota, y
	// el alta de una empresa es el unico sitio donde se puede dejar listo.
	// La migracion 016 hace lo propio con las empresas que ya existian.
	for (const name of [
		'Eventos', 'Restaurantes', 'Hoteles', 'Manufactura', 'Retail', 'Servicios', 'Educación'
	]) {
		await client.query(
			`INSERT INTO commercial_sectors (company_id, name, is_active)
			 VALUES ($1, $2, 1)
			 ON CONFLICT DO NOTHING`,
			[companyId, name]
		);
	}

	for (const name of ['Sucursal', 'Almacén', 'Oficina', 'Salón', 'Domicilio', 'Obra']) {
		await client.query(
			`INSERT INTO client_address_types (company_id, name, is_active)
			 VALUES ($1, $2, 1)
			 ON CONFLICT DO NOTHING`,
			[companyId, name]
		);
	}

	await client.query(
		`INSERT INTO company_info (company_id, id, name, rnc, phone, email, address)
		 VALUES ($1, 1, $2, '000-00000-0', '809-000-0000', $3, 'Santo Domingo, Republica Dominicana')
		 ON CONFLICT (company_id, id) DO NOTHING`,
		[companyId, tenant.companyName, tenant.email]
	);

	const customerResult = await client.query<{ id: number }>(
		`INSERT INTO clients (company_id, name, email, is_active)
		 SELECT $1, $2, $3, 1
		 WHERE NOT EXISTS (SELECT 1 FROM clients WHERE company_id = $1 AND name = $2)
		 RETURNING id`,
		[companyId, tenant.customerName, tenant.email.replace('admin-', 'cliente-')]
	);
	const customerId = customerResult.rows[0]?.id ?? (
		await client.query<{ id: number }>(
			'SELECT id FROM clients WHERE company_id = $1 AND name = $2', [companyId, tenant.customerName]
		)
	).rows[0].id;

	const categoryResult = await client.query<{ id: number }>(
		`INSERT INTO categories (company_id, name, color, is_active)
		 SELECT $1, $2, '#3158c9', 1
		 WHERE NOT EXISTS (SELECT 1 FROM categories WHERE company_id = $1 AND name = $2)
		 RETURNING id`,
		[companyId, tenant.categoryName]
	);
	const categoryId = categoryResult.rows[0]?.id ?? (
		await client.query<{ id: number }>(
			'SELECT id FROM categories WHERE company_id = $1 AND name = $2', [companyId, tenant.categoryName]
		)
	).rows[0].id;

	await client.query(
		`INSERT INTO items
			(company_id, internal_code, name, category_id, item_type, total_quantity,
			 rental_price, status, is_active)
		 SELECT $1, $2, $3, $4, 'cantidad', 10, 100, 'disponible', 1
		 WHERE NOT EXISTS (SELECT 1 FROM items WHERE company_id = $1 AND internal_code = $2)`,
		[companyId, tenant.itemCode, tenant.itemName, categoryId]
	);

	await client.query(
		`INSERT INTO events (company_id, client_id, name, date, status, is_active)
		 SELECT $1, $2, $3, CURRENT_DATE::TEXT, 'tentativo', 1
		 WHERE NOT EXISTS (SELECT 1 FROM events WHERE company_id = $1 AND name = $3)`,
		[companyId, customerId, tenant.eventName]
	);

	console.log(`[db-postgres] Seeded ${tenant.companyName} (${tenant.slug}).`);
}

async function runSeed(): Promise<void> {
	const pool = getPostgresPool();
	const passwordHash = await bcrypt.hash(DEMO_PASSWORD, DEMO_PASSWORD_ROUNDS);
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		for (const tenant of tenants) await upsertDemoTenant(client, tenant, passwordHash);
		await client.query('COMMIT');
		console.log('[db-postgres] Multi-company development seed completed.');
		console.log(`[db-postgres] Demo logins (password: ${DEMO_PASSWORD}):`);
		for (const tenant of tenants) {
			const suffix = tenant.slug.replace('demo-', '');
			console.log(`  ${tenant.companyName}: ${tenant.email} (owner)`);
			for (const member of demoMembers) {
				console.log(`    ${member.emailPrefix}-${suffix}@demo.local (${member.role})`);
			}
		}
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

try {
	await runSeed();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[db-postgres] Seed failed: ${message}`);
	process.exitCode = 1;
} finally {
	await closePostgresPool();
}
