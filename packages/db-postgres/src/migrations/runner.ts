import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getPostgresPool } from '../connection';

export type MigrationRecord = {
	filename: string;
	checksum: string;
};

const migrationsDirectory = fileURLToPath(new URL('.', import.meta.url));
const lockKey = 'esr_cloud_schema_migrations';

function checksum(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
	await client.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id SERIAL PRIMARY KEY,
			filename TEXT NOT NULL UNIQUE,
			checksum TEXT NOT NULL,
			executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
}

export async function runMigrations(): Promise<void> {
	const pool = getPostgresPool();
	const client = await pool.connect();

	try {
		await ensureMigrationsTable(client);
		await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);

		const files = (await readdir(migrationsDirectory))
			.filter((filename) => /^\d+.*\.sql$/i.test(filename))
			.sort((left, right) => left.localeCompare(right));
		const appliedResult = await client.query<MigrationRecord>(
			'SELECT filename, checksum FROM schema_migrations ORDER BY filename'
		);
		const applied = new Map(appliedResult.rows.map((row) => [row.filename, row.checksum]));

		console.log(`[db-postgres] Found ${files.length} migration file(s).`);

		for (const filename of files) {
			const sql = await readFile(new URL(filename, import.meta.url), 'utf8');
			const currentChecksum = checksum(sql);
			const previousChecksum = applied.get(filename);

			if (previousChecksum) {
				if (previousChecksum !== currentChecksum) {
					throw new Error(
						`Migration ${filename} was modified after execution. ` +
						`Expected checksum ${previousChecksum}, received ${currentChecksum}.`
					);
				}
				console.log(`[db-postgres] SKIP ${filename}`);
				continue;
			}

			console.log(`[db-postgres] APPLY ${filename}`);
			try {
				await client.query('BEGIN');
				await client.query(sql);
				await client.query(
					'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
					[filename, currentChecksum]
				);
				await client.query('COMMIT');
				console.log(`[db-postgres] DONE ${filename}`);
			} catch (error) {
				await client.query('ROLLBACK');
				throw new Error(`Migration ${filename} failed and was rolled back.`, { cause: error });
			}
		}

		console.log('[db-postgres] Database schema is up to date.');
	} finally {
		try {
			await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
		} catch {
			// The connection may already be unusable after a server-side failure.
		}
		client.release();
	}
}
