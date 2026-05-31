export type UseCaseResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export function ok<T>(value: T): UseCaseResult<T> {
	return { ok: true, value };
}

export function fail<T = never>(error: string): UseCaseResult<T> {
	return { ok: false, error };
}
