/** PostgreSQL database name for ESR Cloud (shared CCO apps database). */
export const ESR_CLOUD_DATABASE = 'cco_apps';

/** Default PostgreSQL schema where ESR Cloud tables live. */
export const ESR_CLOUD_SCHEMA = 'esr_cloud';

const SCHEMA_PATTERN = /^[a-z][a-z0-9_]*$/;

export function getPostgresSchema(): string {
	const schema = process.env.PGSCHEMA?.trim() || ESR_CLOUD_SCHEMA;
	if (!SCHEMA_PATTERN.test(schema)) {
		throw new Error(`Invalid PGSCHEMA "${schema}". Use lowercase letters, digits and underscores.`);
	}
	return schema;
}

export async function ensureAppSchema(client: { query: (text: string, params?: unknown[]) => Promise<unknown> }): Promise<string> {
	const schema = getPostgresSchema();
	await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
	await client.query(`SET search_path TO ${schema}, public`);
	return schema;
}
