import pg from 'pg';

const { Pool } = pg;

export type PostgresConfig = {
	connectionString?: string;
	ssl?: boolean;
	max?: number;
};

let pool: pg.Pool | null = null;

export function createPostgresPool(config: PostgresConfig = {}): pg.Pool {
	const connectionString = config.connectionString ?? process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is required to connect to PostgreSQL.');
	}

	const useSsl = config.ssl ?? process.env.PGSSL === 'true';

	return new Pool({
		connectionString,
		max: config.max ?? Number(process.env.PGPOOL_MAX || 10),
		ssl: useSsl ? { rejectUnauthorized: false } : undefined
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

export async function query<T = unknown>(
	text: string,
	params: unknown[] = [],
	client: Pick<pg.Pool, 'query'> = getPostgresPool()
): Promise<pg.QueryResult<T>> {
	return client.query<T>(text, params);
}
