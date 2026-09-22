import './load-env.js';
import { closePostgresPool, getPostgresPool } from './connection';
import { PostgresEventRepository } from './repositories/postgres-event.repository';
import { PostgresQuoteRepository } from './repositories/postgres-quote.repository';
import { PostgresCustomerRepository } from './repositories/postgres-customer.repository';
import { PostgresInventoryRepository } from './repositories/postgres-inventory.repository';

/**
 * 15 eventos + 10 cotizaciones aprobadas para Demo Company B, sobre el
 * catalogo y los clientes ya sembrados por seed-demo-b-catalog.ts.
 *
 * Reutiliza los repositorios de Postgres -no SQL a mano- para heredar la
 * numeracion automatica de cotizaciones y el calculo de totales.
 *
 * Seguro de correr mas de una vez: cada evento se busca por nombre antes de
 * crear, y cada cotizacion solo se crea si el evento aun no tiene una.
 */

const SLUG = 'demo-b';

type PlantillaLinea = { itemName: string; quantity: number; tax_rate: number; discount_rate: number };
type Plantilla = 'boda' | 'corporativo' | 'cumpleanos';

const PLANTILLAS: Record<Plantilla, PlantillaLinea[]> = {
	boda: [
		{ itemName: 'Silla Chiavari dorada', quantity: 120, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mesa redonda 180cm (12 personas)', quantity: 10, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mantel redondo blanco', quantity: 10, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Camino de mesa dorado', quantity: 10, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Plato base dorado', quantity: 120, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Copa de vino tinto', quantity: 120, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Copa de agua', quantity: 120, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Candelabro de 5 brazos', quantity: 10, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Servilleta de tela blanca', quantity: 120, tax_rate: 18, discount_rate: 0 }
	],
	corporativo: [
		{ itemName: 'Silla de resina blanca', quantity: 60, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mesa rectangular 180x76cm', quantity: 8, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mantel rectangular blanco', quantity: 8, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Plato llano blanco', quantity: 60, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Tenedor de mesa', quantity: 60, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Cuchillo de mesa', quantity: 60, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Barra de bar blanca', quantity: 1, tax_rate: 18, discount_rate: 0 }
	],
	cumpleanos: [
		{ itemName: 'Silla Tiffany transparente', quantity: 30, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mesa redonda 150cm (10 personas)', quantity: 3, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Mantel color azul cielo', quantity: 3, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Torre de cupcakes 3 niveles', quantity: 1, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Plato de postre blanco', quantity: 30, tax_rate: 18, discount_rate: 0 },
		{ itemName: 'Vaso highball', quantity: 30, tax_rate: 18, discount_rate: 0 }
	]
};

type EventoSeed = {
	name: string;
	date: string;
	clientName: string;
	event_type: string;
	status: 'confirmado' | 'tentativo';
	plantilla: Plantilla | null;
	/** Variacion de cantidad respecto a la plantilla base, en proporcion (1 = sin cambio). */
	factor: number;
};

const EVENTOS: EventoSeed[] = [
	{ name: 'Boda de Ana y Carlos', date: '2026-09-22', clientName: 'Eventos & Detalles María Fernanda', event_type: 'Boda', status: 'confirmado', plantilla: 'boda', factor: 1 },
	{ name: 'Quinceañero de Sofía', date: '2026-09-24', clientName: 'Carmen Objío', event_type: 'Cumpleanos', status: 'confirmado', plantilla: 'cumpleanos', factor: 1 },
	{ name: 'Gala Benéfica Fundación Solidaria', date: '2026-09-25', clientName: 'Fundación Empresarial Solidaria', event_type: 'Corporativo', status: 'confirmado', plantilla: 'corporativo', factor: 1 },
	{ name: 'Boda Reyes-Marte', date: '2026-09-27', clientName: 'Salón Villa Real', event_type: 'Boda', status: 'confirmado', plantilla: 'boda', factor: 0.9 },
	{ name: 'Brunch Corporativo Casa Colonial', date: '2026-09-28', clientName: 'Hotel Boutique Casa Colonial', event_type: 'Corporativo', status: 'confirmado', plantilla: 'corporativo', factor: 1.1 },
	{ name: 'Cena Degustación Sabor Criollo', date: '2026-09-30', clientName: 'Catering Sabor Criollo', event_type: 'Corporativo', status: 'confirmado', plantilla: null, factor: 1 },
	{ name: 'Boda de Laura y Miguel', date: '2026-10-03', clientName: 'Eventos & Detalles María Fernanda', event_type: 'Boda', status: 'tentativo', plantilla: 'boda', factor: 1.1 },
	{ name: 'Cumpleaños 50 de Don Rafael', date: '2026-10-05', clientName: 'Carmen Objío', event_type: 'Cumpleanos', status: 'tentativo', plantilla: 'cumpleanos', factor: 1.15 },
	{ name: 'Conferencia Anual Fundación Solidaria', date: '2026-10-08', clientName: 'Fundación Empresarial Solidaria', event_type: 'Corporativo', status: 'tentativo', plantilla: 'corporativo', factor: 0.9 },
	{ name: 'Boda Villa Real — Familia Cruz', date: '2026-10-10', clientName: 'Salón Villa Real', event_type: 'Boda', status: 'tentativo', plantilla: 'boda', factor: 1 },
	{ name: 'Cena de Networking Casa Colonial', date: '2026-10-14', clientName: 'Hotel Boutique Casa Colonial', event_type: 'Corporativo', status: 'tentativo', plantilla: 'corporativo', factor: 1 },
	{ name: 'Buffet Corporativo Sabor Criollo', date: '2026-10-17', clientName: 'Catering Sabor Criollo', event_type: 'Corporativo', status: 'tentativo', plantilla: null, factor: 1 },
	{ name: 'Boda de Fernanda y Luis', date: '2026-10-21', clientName: 'Eventos & Detalles María Fernanda', event_type: 'Boda', status: 'tentativo', plantilla: null, factor: 1 },
	{ name: 'Baby Shower de Carmen', date: '2026-10-25', clientName: 'Carmen Objío', event_type: 'Cumpleanos', status: 'tentativo', plantilla: null, factor: 1 },
	{ name: 'Aniversario Villa Real', date: '2026-10-30', clientName: 'Salón Villa Real', event_type: 'Corporativo', status: 'tentativo', plantilla: null, factor: 1 }
];

const CONDICIONES = 'Incluye montaje y desmontaje. Transporte no incluido.';

async function findCompanyId(pool: Awaited<ReturnType<typeof getPostgresPool>>): Promise<string> {
	const result = await pool.query<{ id: string }>('SELECT id FROM companies WHERE slug = $1', [SLUG]);
	if (!result.rows[0]) {
		throw new Error(`No existe una empresa con slug "${SLUG}". Corre "pnpm --filter @esr/db-postgres seed" primero.`);
	}
	return result.rows[0].id;
}

async function run(): Promise<void> {
	const pool = getPostgresPool();
	const ctx = { companyId: await findCompanyId(pool) };

	const eventRepo = new PostgresEventRepository(pool);
	const quoteRepo = new PostgresQuoteRepository(pool);
	const customerRepo = new PostgresCustomerRepository(pool);
	const inventoryRepo = new PostgresInventoryRepository(pool);

	const clientes = await customerRepo.list(ctx);
	const clienteIdByName = new Map(clientes.map((c) => [c.name, String(c.id)]));

	const articulos = await inventoryRepo.list(ctx);
	const articuloByName = new Map(articulos.map((a) => [a.name, a]));

	const today = new Date().toISOString().slice(0, 10);

	let eventosCreados = 0;
	let cotizacionesCreadas = 0;

	for (const seed of EVENTOS) {
		const clientId = clienteIdByName.get(seed.clientName);
		if (!clientId) throw new Error(`Cliente no encontrado: "${seed.clientName}". Corre primero seed-demo-b-catalog.`);

		const existentes = await eventRepo.searchByName(ctx, seed.name, 5);
		let evento = existentes.find((e) => e.name === seed.name) ?? null;
		if (!evento) {
			evento = await eventRepo.create(ctx, {
				client_id: clientId,
				name: seed.name,
				event_type: seed.event_type,
				date: seed.date,
				status: seed.status
			} as never);
			eventosCreados++;
			console.log(`[seed-demo-b-events] Evento creado: ${seed.name} (${seed.date}, ${seed.status}).`);
		}

		if (!seed.plantilla) continue;

		const cotizacionesDelEvento = await quoteRepo.findByEventId(ctx, evento.id!);
		if (cotizacionesDelEvento.length > 0) continue;

		const lineas = PLANTILLAS[seed.plantilla].map((linea) => {
			const articulo = articuloByName.get(linea.itemName);
			if (!articulo) throw new Error(`Artículo no encontrado: "${linea.itemName}". Corre primero seed-demo-b-catalog.`);
			return {
				item_id: articulo.id!,
				name: articulo.name,
				code: articulo.internal_code ?? null,
				quantity: Math.max(1, Math.round(linea.quantity * seed.factor)),
				price: Number(articulo.rental_price || 0),
				discount_rate: linea.discount_rate,
				tax_rate: linea.tax_rate
			};
		});

		const cotizacion = await quoteRepo.create(ctx, {
			client_id: clientId,
			event_id: evento.id!,
			date: today,
			validity_days: 15,
			status: 'borrador',
			conditions: CONDICIONES,
			items: lineas
		} as never);
		await quoteRepo.changeStatus(ctx, cotizacion.id!, 'aprobada');
		cotizacionesCreadas++;
		console.log(`[seed-demo-b-events] Cotización aprobada para "${seed.name}": ${cotizacion.quote_number}.`);
	}

	console.log(
		`[seed-demo-b-events] Eventos: ${eventosCreados} creados (${EVENTOS.length - eventosCreados} ya existían). ` +
			`Cotizaciones: ${cotizacionesCreadas} creadas.`
	);
	console.log('[seed-demo-b-events] Listo.');
}

try {
	await run();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[seed-demo-b-events] Falló: ${message}`);
	process.exitCode = 1;
} finally {
	await closePostgresPool();
}
