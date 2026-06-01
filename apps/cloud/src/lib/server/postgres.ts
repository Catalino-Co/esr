import { env } from '$env/dynamic/private';

export type PostgresConnectionStatus = {
	configured: boolean;
	message: string;
};

export function getPostgresConnectionStatus(): PostgresConnectionStatus {
	return {
		configured: Boolean(env.DATABASE_URL),
		message: env.DATABASE_URL
			? 'DATABASE_URL is configured for future PostgreSQL integration.'
			: 'DATABASE_URL is not configured yet. PostgreSQL integration is intentionally pending.'
	};
}
