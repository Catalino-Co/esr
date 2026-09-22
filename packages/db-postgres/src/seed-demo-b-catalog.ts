import './load-env.js';
import { RECORD_STATE } from '@esr/core';
import { closePostgresPool, getPostgresPool } from './connection';
import { PostgresCategoryRepository, PostgresSubcategoryRepository } from './repositories/postgres-category.repository';
import {
	PostgresCommercialSectorRepository,
	PostgresSupplierRepository,
	PostgresUnitOfMeasureRepository,
	PostgresWarehouseRepository
} from './repositories/postgres-catalog.repository';
import { PostgresInventoryRepository } from './repositories/postgres-inventory.repository';
import { PostgresCustomerRepository } from './repositories/postgres-customer.repository';

/**
 * Catalogo de "montaje de eventos" (mesas, sillas, menaje, decoracion,
 * textiles, uteleria) para Demo Company B, que ya nacio como una empresa de
 * eventos generica (sonido/iluminacion/mobiliario basico, ver seed.ts) y el
 * usuario reoriento a mano -desactivo Efectos Especiales y Sonido- hacia
 * este otro perfil.
 *
 * Reutiliza los repositorios de Postgres tal cual los usa la app -no SQL a
 * mano-, asi que hereda gratis la generacion de `internal_code`, la fila de
 * `item_inventory`, y las mismas reglas de negocio que el resto del codigo.
 *
 * Seguro de correr mas de una vez: cada categoria/subcategoria/proveedor/
 * almacen se busca por nombre antes de crear, y cada articulo se busca por
 * nombre antes de crear -los articulos no tienen un indice unico de nombre,
 * asi que esa comprobacion la hace este script, no la base-.
 */

const SLUG = 'demo-b';

const WAREHOUSE_PRINCIPAL = { name: 'Almacén Principal', code: 'PRIN' };
const WAREHOUSE_SECUNDARIO = { name: 'Almacén Secundario', code: 'SEC' };

const SUPPLIERS = {
	textiles: { name: 'Mantelería del Caribe', service: 'Manteles, servilletas y textiles para eventos' },
	menaje: { name: 'Vajillas y Cristalería RD', service: 'Vajilla, cristalería y cubertería de alquiler' },
	mobiliario: { name: 'Mobiliario Eventos Elegance', service: 'Sillas, mesas y mobiliario para eventos' },
	decoracion: { name: 'Decoraciones y Utilería Total', service: 'Decoración, centros de mesa y utilería' }
} as const;

type ItemSeed = { name: string; price: number };
type SubcategorySeed = { name: string; items: ItemSeed[]; existing?: boolean };
type CategorySeed = {
	name: string;
	color: string;
	existing?: boolean;
	warehouse: typeof WAREHOUSE_PRINCIPAL | typeof WAREHOUSE_SECUNDARIO;
	supplier: (typeof SUPPLIERS)[keyof typeof SUPPLIERS];
	/** Unidades iniciales por articulo de esta categoria (con algo de variacion por indice). */
	qtyBase: number;
	subcategories: SubcategorySeed[];
};

const CATALOG: CategorySeed[] = [
	{
		name: 'Menajes',
		color: '#0891b2',
		warehouse: WAREHOUSE_PRINCIPAL,
		supplier: SUPPLIERS.menaje,
		qtyBase: 30,
		subcategories: [
			{
				name: 'Plato base',
				items: [
					{ name: 'Plato base dorado', price: 65 },
					{ name: 'Plato base plateado', price: 65 },
					{ name: 'Plato base cobre/rosé', price: 68 },
					{ name: 'Plato base blanco perlado', price: 60 },
					{ name: 'Plato base negro mate', price: 60 },
					{ name: 'Plato base transparente acrílico', price: 55 }
				]
			},
			{
				name: 'Cristalería',
				items: [
					{ name: 'Copa de agua', price: 35 },
					{ name: 'Copa de vino tinto', price: 40 },
					{ name: 'Copa de vino blanco', price: 40 },
					{ name: 'Copa de champagne', price: 45 },
					{ name: 'Copa balón', price: 50 },
					{ name: 'Vaso old fashioned', price: 30 },
					{ name: 'Vaso highball', price: 30 },
					{ name: 'Jarra de cristal', price: 55 }
				]
			},
			{
				name: 'Dulces y cupones',
				items: [
					{ name: 'Torre de cupcakes 3 niveles', price: 350 },
					{ name: 'Base para dulces redonda', price: 200 },
					{ name: 'Stand de dulces acrílico', price: 220 },
					{ name: 'Dispensador de dulces', price: 180 },
					{ name: 'Charola de postres 2 niveles', price: 250 },
					{ name: 'Campana de cristal para postres', price: 280 }
				]
			},
			{
				name: 'Platos',
				items: [
					{ name: 'Plato llano blanco', price: 35 },
					{ name: 'Plato hondo blanco', price: 35 },
					{ name: 'Plato de postre blanco', price: 30 },
					{ name: 'Plato para ensalada', price: 32 },
					{ name: 'Plato cuadrado moderno', price: 40 },
					{ name: 'Plato de melamina blanco', price: 28 }
				]
			},
			{
				name: 'Utensilios',
				items: [
					{ name: 'Tenedor de mesa', price: 18 },
					{ name: 'Cuchillo de mesa', price: 18 },
					{ name: 'Cuchara de mesa', price: 18 },
					{ name: 'Tenedor de postre', price: 16 },
					{ name: 'Cuchara de postre', price: 16 },
					{ name: 'Cuchara de servir', price: 25 },
					{ name: 'Tenedor de servir', price: 25 },
					{ name: 'Pinza de servir', price: 28 },
					{ name: 'Cucharón de servir', price: 30 }
				]
			}
		]
	},
	{
		name: 'Decoración',
		color: '#d946ef',
		warehouse: WAREHOUSE_PRINCIPAL,
		supplier: SUPPLIERS.decoracion,
		qtyBase: 14,
		subcategories: [
			{
				name: 'Floreros',
				items: [
					{ name: 'Florero cilíndrico alto', price: 220 },
					{ name: 'Florero cilíndrico bajo', price: 180 },
					{ name: 'Florero cónico', price: 200 },
					{ name: 'Florero geométrico', price: 250 },
					{ name: 'Florero de cristal facetado', price: 280 }
				]
			},
			{
				name: 'Floreros solitarios',
				items: [
					{ name: 'Florero solitario cristal', price: 90 },
					{ name: 'Florero solitario cobre', price: 110 },
					{ name: 'Florero solitario dorado', price: 120 }
				]
			},
			{
				name: 'Porta velas y faroles',
				items: [
					{ name: 'Porta vela de cristal', price: 130 },
					{ name: 'Farol marroquí', price: 250 },
					{ name: 'Farol de cristal colgante', price: 220 },
					{ name: 'Portavela geométrico dorado', price: 150 },
					{ name: 'Candil de mesa', price: 180 }
				]
			},
			{
				name: 'Candelabros',
				items: [
					{ name: 'Candelabro de 3 brazos', price: 320 },
					{ name: 'Candelabro de 5 brazos', price: 450 },
					{ name: 'Candelabro dorado alto', price: 500 },
					{ name: 'Candelabro plateado', price: 480 }
				]
			},
			{
				name: 'Jaulas',
				items: [
					{ name: 'Jaula decorativa dorada', price: 380 },
					{ name: 'Jaula decorativa blanca', price: 350 },
					{ name: 'Jaula vintage con flores', price: 420 }
				]
			},
			{
				name: 'Elevadores',
				items: [
					{ name: 'Elevador de cristal alto', price: 250 },
					{ name: 'Elevador acrílico transparente', price: 220 },
					{ name: 'Elevador dorado geométrico', price: 280 }
				]
			},
			{
				name: 'Otros',
				items: [
					{ name: 'Espejo decorativo para centro de mesa', price: 180 },
					{ name: 'Base de mesa redonda espejada', price: 220 },
					{ name: 'Runner decorativo', price: 150 },
					{ name: 'Piedras decorativas de cristal', price: 100 },
					{ name: 'Números de mesa dorados', price: 120 }
				]
			},
			{
				name: 'Lámparas Decorativas',
				items: [
					{ name: 'Lámpara de mesa dorada', price: 250 },
					{ name: 'Lámpara colgante decorativa', price: 300 },
					{ name: 'Vela LED decorativa', price: 90 },
					{ name: 'Guirnalda de luces cálidas', price: 200 }
				]
			}
		]
	},
	{
		name: 'Mobiliario',
		color: '#10b981',
		existing: true,
		warehouse: WAREHOUSE_SECUNDARIO,
		supplier: SUPPLIERS.mobiliario,
		qtyBase: 20,
		subcategories: [
			{
				name: 'Sillas',
				existing: true,
				items: [
					{ name: 'Silla Tiffany transparente', price: 120 },
					{ name: 'Silla Tiffany dorada', price: 130 },
					{ name: 'Silla Chiavari dorada', price: 140 },
					{ name: 'Silla Chiavari blanca', price: 140 },
					{ name: 'Silla Cross Back de madera', price: 110 },
					{ name: 'Silla de resina blanca', price: 90 }
				]
			},
			{
				name: 'Mesas',
				existing: true,
				items: [
					{ name: 'Mesa redonda 150cm (10 personas)', price: 650 },
					{ name: 'Mesa redonda 180cm (12 personas)', price: 750 },
					{ name: 'Mesa rectangular 180x76cm', price: 600 },
					{ name: 'Mesa rectangular 240x76cm', price: 700 },
					{ name: 'Mesa cocktail alta', price: 550 },
					{ name: 'Mesa infantil', price: 450 }
				]
			},
			{
				name: 'Otomanes, bancos y reclinatorios',
				items: [
					{ name: 'Otomán tapizado de terciopelo', price: 900 },
					{ name: 'Banco tapizado', price: 800 },
					{ name: 'Reclinatorio para ceremonia', price: 1200 },
					{ name: 'Puff redondo decorativo', price: 750 }
				]
			},
			{
				name: 'Bares',
				items: [
					{ name: 'Barra de bar blanca', price: 3500 },
					{ name: 'Barra de bar de madera', price: 4000 },
					{ name: 'Carrito de bar vintage', price: 3000 },
					{ name: 'Estación de bebidas móvil', price: 3200 }
				]
			},
			{
				name: 'Mamparas',
				items: [
					{ name: 'Mampara blanca decorativa', price: 2800 },
					{ name: 'Mampara con luces', price: 4500 },
					{ name: 'Mampara floral para backdrop', price: 5000 },
					{ name: 'Biombo plegable de madera', price: 2200 }
				]
			}
		]
	},
	{
		name: 'Textiles',
		color: '#f59e0b',
		warehouse: WAREHOUSE_PRINCIPAL,
		supplier: SUPPLIERS.textiles,
		qtyBase: 22,
		subcategories: [
			{
				name: 'Manteles',
				// Ya existia como subcategoria de Mobiliario -sin articulos
				// enganchados-: `moveMantelesToTextiles()` la reasigna aqui antes
				// de crear estos articulos.
				existing: true,
				items: [
					{ name: 'Mantel redondo blanco', price: 400 },
					{ name: 'Mantel rectangular blanco', price: 380 },
					{ name: 'Mantel color marfil', price: 420 },
					{ name: 'Mantel color azul cielo', price: 420 },
					{ name: 'Camino de mesa dorado', price: 250 },
					{ name: 'Cubremantel de encaje', price: 350 }
				]
			},
			{
				name: 'Servilletas',
				items: [
					{ name: 'Servilleta de tela blanca', price: 25 },
					{ name: 'Servilleta de tela azul', price: 25 },
					{ name: 'Servilleta con anillo dorado', price: 35 },
					{ name: 'Servilleta de encaje', price: 30 }
				]
			}
		]
	},
	{
		name: 'Utilería',
		color: '#65a30d',
		warehouse: WAREHOUSE_PRINCIPAL,
		supplier: SUPPLIERS.decoracion,
		qtyBase: 12,
		subcategories: [
			{
				name: 'Maceteros',
				items: [
					{ name: 'Macetero blanco mediano', price: 220 },
					{ name: 'Macetero dorado decorativo', price: 260 },
					{ name: 'Macetero de mimbre', price: 180 }
				]
			},
			{
				name: 'Canastas',
				items: [
					{ name: 'Canasta de mimbre grande', price: 200 },
					{ name: 'Canasta de mimbre pequeña', price: 130 },
					{ name: 'Canasta para pan', price: 110 },
					{ name: 'Canasta decorativa con asa', price: 150 }
				]
			}
		]
	}
];

type ClientSeed = {
	name: string;
	document_id: string;
	document_type: 'rnc' | 'cedula';
	phone: string;
	email: string;
	address: string;
	contact_person?: string;
	sectorName?: string;
};

const CLIENTS: ClientSeed[] = [
	{
		name: 'Eventos & Detalles María Fernanda',
		document_id: '1-31-45678-9',
		document_type: 'rnc',
		phone: '809-555-0101',
		email: 'contacto@eventosmariafernanda.com.do',
		address: 'Av. Winston Churchill, Santo Domingo, RD',
		contact_person: 'María Fernanda Restituyo',
		sectorName: 'Eventos'
	},
	{
		name: 'Salón Villa Real',
		document_id: '1-30-98765-4',
		document_type: 'rnc',
		phone: '809-555-0102',
		email: 'reservas@villareal.com.do',
		address: 'Calle Principal, Santiago, RD',
		sectorName: 'Eventos'
	},
	{
		name: 'Hotel Boutique Casa Colonial',
		document_id: '1-32-11223-5',
		document_type: 'rnc',
		phone: '809-555-0103',
		email: 'eventos@casacolonial.com.do',
		address: 'Zona Colonial, Santo Domingo, RD',
		sectorName: 'Hoteles'
	},
	{
		name: 'Catering Sabor Criollo',
		document_id: '1-33-44556-7',
		document_type: 'rnc',
		phone: '809-555-0104',
		email: 'info@saborcriollo.com.do',
		address: 'Av. 27 de Febrero, Santo Domingo, RD',
		sectorName: 'Restaurantes'
	},
	{
		name: 'Fundación Empresarial Solidaria',
		document_id: '1-34-77889-1',
		document_type: 'rnc',
		phone: '809-555-0105',
		email: 'contacto@fundacionsolidaria.org.do',
		address: 'Piantini, Santo Domingo, RD',
		sectorName: 'Servicios'
	},
	{
		name: 'Carmen Objío',
		document_id: '001-1234567-8',
		document_type: 'cedula',
		phone: '809-555-0106',
		email: 'carmen.objio@gmail.com',
		address: 'Bella Vista, Santo Domingo, RD'
	}
];

async function findCompanyId(pool: Awaited<ReturnType<typeof getPostgresPool>>): Promise<string> {
	const result = await pool.query<{ id: string }>('SELECT id FROM companies WHERE slug = $1', [SLUG]);
	if (!result.rows[0]) {
		throw new Error(`No existe una empresa con slug "${SLUG}". Corre "pnpm --filter @esr/db-postgres seed" primero.`);
	}
	return result.rows[0].id;
}

async function itemExists(pool: Awaited<ReturnType<typeof getPostgresPool>>, companyId: string, name: string): Promise<boolean> {
	const result = await pool.query(
		`SELECT 1 FROM items WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
		[companyId, name]
	);
	return (result.rowCount ?? 0) > 0;
}

async function run(): Promise<void> {
	const pool = getPostgresPool();
	const ctx = { companyId: await findCompanyId(pool) };

	const categoryRepo = new PostgresCategoryRepository(pool);
	const subcategoryRepo = new PostgresSubcategoryRepository(pool);
	const supplierRepo = new PostgresSupplierRepository(pool);
	const warehouseRepo = new PostgresWarehouseRepository(pool);
	const unitRepo = new PostgresUnitOfMeasureRepository(pool);
	const sectorRepo = new PostgresCommercialSectorRepository(pool);
	const inventoryRepo = new PostgresInventoryRepository(pool);
	const customerRepo = new PostgresCustomerRepository(pool);

	// ── Limpieza: dato suelto de una verificacion anterior ────────────────────
	const prueba = await pool.query<{ id: number; is_active: number }>(
		`SELECT id, is_active FROM subcategories WHERE company_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))`,
		[ctx.companyId, 'Prueba Sub Nueva']
	);
	if (prueba.rows[0] && prueba.rows[0].is_active !== RECORD_STATE.ARCHIVED) {
		await subcategoryRepo.setActive(ctx, prueba.rows[0].id, RECORD_STATE.ARCHIVED);
		console.log('[seed-demo-b] Archivada la subcategoría de prueba "Prueba Sub Nueva".');
	}

	// ── Unidad de medida (ya sembrada por la migracion 019 para toda empresa) ─
	const unidades = await unitRepo.list(ctx);
	const unidad = unidades.find((u) => u.name === 'Unidad');
	if (!unidad) throw new Error('No se encontró la unidad de medida "Unidad" para esta empresa.');

	// ── Almacenes ──────────────────────────────────────────────────────────
	const warehouses = await warehouseRepo.list(ctx);
	let principal = warehouses.find((w) => w.code === WAREHOUSE_PRINCIPAL.code);
	if (!principal) principal = await warehouseRepo.create(ctx, { name: WAREHOUSE_PRINCIPAL.name, code: WAREHOUSE_PRINCIPAL.code });
	let secundario = warehouses.find((w) => w.code === WAREHOUSE_SECUNDARIO.code);
	if (!secundario) {
		secundario = await warehouseRepo.create(ctx, { name: WAREHOUSE_SECUNDARIO.name, code: WAREHOUSE_SECUNDARIO.code });
		console.log(`[seed-demo-b] Creado ${WAREHOUSE_SECUNDARIO.name}.`);
	}
	const warehouseIdByCode: Record<string, string> = {
		[WAREHOUSE_PRINCIPAL.code]: String(principal.id),
		[WAREHOUSE_SECUNDARIO.code]: String(secundario.id)
	};

	// ── Proveedores ────────────────────────────────────────────────────────
	const supplierIdByName: Record<string, string> = {};
	for (const supplier of Object.values(SUPPLIERS)) {
		const existente = await supplierRepo.findByName(ctx, supplier.name);
		const fila = existente ?? (await supplierRepo.create(ctx, { name: supplier.name, service: supplier.service }));
		supplierIdByName[supplier.name] = String(fila.id);
	}
	console.log(`[seed-demo-b] ${Object.keys(SUPPLIERS).length} proveedores listos.`);

	// ── Categorías, subcategorías y artículos ─────────────────────────────
	let creadas = 0;
	let omitidas = 0;
	for (const categoria of CATALOG) {
		const existenteCat = await categoryRepo.findByName(ctx, categoria.name);
		const filaCat = existenteCat ?? (await categoryRepo.create(ctx, { name: categoria.name, color: categoria.color }));
		if (!existenteCat) console.log(`[seed-demo-b] Categoría creada: ${categoria.name}`);

		for (const subcategoria of categoria.subcategories) {
			const existenteSub = await subcategoryRepo.findByName(ctx, filaCat.id!, subcategoria.name);
			const filaSub =
				existenteSub ?? (await subcategoryRepo.create(ctx, { category_id: filaCat.id!, name: subcategoria.name }));
			if (!existenteSub) console.log(`[seed-demo-b]   Subcategoría creada: ${categoria.name} › ${subcategoria.name}`);

			const warehouseId = warehouseIdByCode[categoria.warehouse.code];
			const supplierId = supplierIdByName[categoria.supplier.name];

			for (const [indice, articulo] of subcategoria.items.entries()) {
				if (await itemExists(pool, ctx.companyId, articulo.name)) {
					omitidas++;
					continue;
				}
				const item = await inventoryRepo.create(ctx, {
					name: articulo.name,
					category_id: filaCat.id!,
					subcategory_id: filaSub.id!,
					rental_price: articulo.price,
					supplier_id: supplierId,
					uom_id: unidad.id!,
					tracks_inventory: true
				} as never);

				await inventoryRepo.addSupplier(ctx, item.id!, supplierId, true);

				const cantidad = categoria.qtyBase + (indice % 3) * 3;
				await inventoryRepo.addToWarehouse(ctx, item.id!, warehouseId);
				await inventoryRepo.moveStock(ctx, {
					item_id: item.id!,
					warehouse_id: warehouseId,
					type: 'ajuste',
					quantity: cantidad,
					notes: 'Carga inicial de inventario (demo).'
				});
				creadas++;
			}
		}
	}
	console.log(`[seed-demo-b] Artículos: ${creadas} creados, ${omitidas} ya existían.`);

	// ── "Manteles" ya existía bajo Mobiliario, sin artículos enganchados. El
	// bucle de arriba creó una "Manteles" nueva bajo Textiles (con sus 6
	// artículos) porque el nombre solo es único DENTRO de cada categoría; la
	// vieja, huérfana, se archiva en vez de renombrarla -renombrarla chocaría
	// con la que ya se acaba de crear en el mismo nombre-.
	const textiles = await categoryRepo.findByName(ctx, 'Textiles');
	if (textiles) {
		const mantelesViejo = (await subcategoryRepo.list(ctx)).find(
			(s) => s.name === 'Manteles' && String(s.category_id) !== String(textiles.id)
		);
		if (mantelesViejo) {
			await subcategoryRepo.setActive(ctx, mantelesViejo.id!, RECORD_STATE.ARCHIVED);
			console.log('[seed-demo-b] "Manteles" vieja (bajo Mobiliario, sin artículos) archivada; ahora vive en Textiles.');
		}
	}

	// ── Clientes ───────────────────────────────────────────────────────────
	const sectores = await sectorRepo.list(ctx);
	const clientesExistentes = await customerRepo.list(ctx);
	let clientesCreados = 0;
	for (const cliente of CLIENTS) {
		if (clientesExistentes.some((c) => c.name === cliente.name)) continue;
		const sector = cliente.sectorName ? sectores.find((s) => s.name === cliente.sectorName) : null;
		await customerRepo.create(ctx, {
			name: cliente.name,
			document_id: cliente.document_id,
			document_type: cliente.document_type,
			phone: cliente.phone,
			email: cliente.email,
			address: cliente.address,
			contact_person: cliente.contact_person,
			sector_id: sector?.id ?? null
		} as never);
		clientesCreados++;
	}
	console.log(`[seed-demo-b] Clientes: ${clientesCreados} creados (${CLIENTS.length - clientesCreados} ya existían).`);

	console.log('[seed-demo-b] Listo.');
}

try {
	await run();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[seed-demo-b] Falló: ${message}`);
	process.exitCode = 1;
} finally {
	await closePostgresPool();
}
