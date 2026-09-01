import './load-env.js';
import pg from 'pg';
import { getPostgresSchema } from './schema';

const { Pool } = pg;

export type PostgresConfig = {
	connectionString?: string;
	ssl?: boolean;
	max?: number;
	schema?: string;
};

let pool: pg.Pool | null = null;

export function createPostgresPool(config: PostgresConfig = {}): pg.Pool {
	const connectionString = config.connectionString ?? process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
	}

	const useSsl = config.ssl ?? process.env.PGSSL === 'true';
	const schema = config.schema ?? getPostgresSchema();

	/**
	 * El `search_path` va en `options`, que viaja en el paquete de arranque de
	 * la conexion. Queda puesto ANTES de que se pueda ejecutar nada.
	 *
	 * Aqui habia ademas un manejador del evento `connect` que hacia
	 * `void client.query('SET search_path ...')`. Sobraba —`options` ya lo
	 * dejaba hecho— y ademas era la causa de este aviso en cada arranque:
	 *
	 *   DeprecationWarning: Calling client.query() when the client is already
	 *   executing a query is deprecated and will be removed in pg@9.0.
	 *
	 * El motivo, leido en la traza: `pg-pool` emite `connect` y acto seguido
	 * entrega el cliente a quien lo estaba esperando, que lanza SU consulta
	 * mientras el `SET` sin esperar sigue en vuelo. Hoy no corrompe nada
	 * —el cliente encola y respeta el orden— pero en pg@9 dejaria de funcionar.
	 *
	 * No se arregla poniendole un `await` al manejador: `pg-pool` no espera a
	 * que termine, asi que el `void` era honesto sobre lo que ocurria. La
	 * solucion es no necesitarlo.
	 */
	return new Pool({
		connectionString,
		max: config.max ?? Number(process.env.PGPOOL_MAX || 10),
		ssl: useSsl ? { rejectUnauthorized: false } : undefined,
		options: `-c search_path=${schema},public`
	});
}

export function getPostgresPool(config?: PostgresConfig): pg.Pool {
	if (!pool) {
		pool = createPostgresPool(config);
	}

	return pool;
}

export async function closePostgresPool(): Promise<void> {
	if (!pool) return;
	await pool.end();
	pool = null;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
	text: string,
	params: unknown[] = [],
	client: Pick<pg.Pool, 'query'> = getPostgresPool()
): Promise<pg.QueryResult<T>> {
	return client.query<T>(text, params);
}
