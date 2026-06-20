import { closePostgresPool } from './connection';
import { runMigrations } from './migrations/runner';

try {
	await runMigrations();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[db-postgres] Migration failed: ${message}`);
	if (error instanceof Error && error.cause) console.error(error.cause);
	process.exitCode = 1;
} finally {
	await closePostgresPool();
}
