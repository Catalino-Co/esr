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

	const nextPool = new Pool({
		connectionString,
		max: config.max ?? Number(process.env.PGPOOL_MAX || 10),
		ssl: useSsl ? { rejectUnauthorized: false } : undefined,
		options: `-c search_path=${schema},public`
	});

	nextPool.on('connect', (client) => {
		void client.query(`SET search_path TO ${schema}, public`);
	});

	return nextPool;
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
