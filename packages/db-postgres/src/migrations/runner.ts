import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { getPostgresPool } from '../connection';
import { ensureAppSchema } from '../schema';

export type MigrationRecord = {
	filename: string;
	checksum: string;
};

const migrationsDirectory = fileURLToPath(new URL('.', import.meta.url));
const lockKey = 'esr_cloud_schema_migrations';

/**
 * La huella de una migracion, NORMALIZANDO los finales de linea.
 *
 * El checksum existe para detectar que alguien EDITO una migracion ya aplicada,
 * porque entonces la base y el archivo dejan de contar la misma historia. Un
 * CRLF donde habia un LF no es esa clase de cambio: el SQL es identico.
 *
 * Y pasa solo: en Windows, con `core.autocrlf` en `true` y sin `.gitattributes`,
 * cualquier checkout —un `git stash`, un cambio de rama, un clon reciente—
 * reescribe los archivos con CRLF. El runner los veia distintos y se negaba a
 * arrancar contra una base ya migrada, que es lo peor que puede hacer: no es que
 * fallara la migracion nueva, es que ninguna corria.
 */
function checksum(content: string): string {
	return createHash('sha256').update(normalizeEol(content), 'utf8').digest('hex');
}

/** CRLF a LF. Lo unico que hace falta normalizar para que dos checkouts coincidan. */
function normalizeEol(content: string): string {
	return content.split('\r\n').join('\n');
}

/** La huella SIN normalizar: la que grabaron las instalaciones anteriores. */
function legacyChecksum(content: string): string {
	return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
	const schema = await ensureAppSchema(client);
	await client.query(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id SERIAL PRIMARY KEY,
			filename TEXT NOT NULL UNIQUE,
			checksum TEXT NOT NULL,
			executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`);
	console.log(`[db-postgres] Using schema "${schema}" in database from DATABASE_URL.`);
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
					// Antes de dar el aviso: ¿es la huella vieja, la de antes de
					// normalizar? Entonces el archivo no cambio, cambio como se mide.
					// Se reescribe y se sigue, en vez de obligar a cirugia manual sobre
					// `schema_migrations` en cada instalacion que exista.
					if (previousChecksum === legacyChecksum(sql)) {
						await client.query(
							'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1',
							[filename, currentChecksum]
						);
						console.log(`[db-postgres] REHASH ${filename}`);
						continue;
					}
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
