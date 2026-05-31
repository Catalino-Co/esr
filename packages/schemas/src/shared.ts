export type ESRId = number | string;

export type Nullable<T> = T | null;

export type ValidationResult = {
	valid: boolean;
	issues: string[];
};

export function valid(): ValidationResult {
	return { valid: true, issues: [] };
}

export function invalid(issue: string): ValidationResult {
	return { valid: false, issues: [issue] };
}

export function isPresent(value: unknown): boolean {
	return value !== null && value !== undefined && value !== '';
}

export function isNonEmptyText(value: unknown): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}
