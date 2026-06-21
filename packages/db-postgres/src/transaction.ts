import type pg from 'pg';
import { getPostgresPool } from './connection';

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
	const pool = getPostgresPool();
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await fn(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}
