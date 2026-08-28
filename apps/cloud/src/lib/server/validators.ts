import { ASSIGNABLE_ROLES } from '@esr/core';
import { validateCompanySettingsInput, validateCustomerInput, type CompanyRole } from '@esr/schemas';

export type ValidationError = { field: string; message: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCloudCustomerInput(data: {
	name?: string;
	email?: string;
	phone?: string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	const nameCheck = validateCustomerInput({ name: data.name ?? '' });
	if (!nameCheck.valid) errors.push({ field: 'name', message: 'El nombre es obligatorio.' });
	if (data.email?.trim() && !EMAIL_PATTERN.test(data.email.trim())) {
		errors.push({ field: 'email', message: 'El email no es válido.' });
	}
	return errors;
}

export function validateCloudInventoryInput(data: {
	name?: string;
	total_quantity?: number | string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!data.name?.trim()) errors.push({ field: 'name', message: 'El nombre es obligatorio.' });
	const qty = Number(data.total_quantity ?? 0);
	if (Number.isNaN(qty) || qty < 0) {
		errors.push({ field: 'total_quantity', message: 'La cantidad total debe ser un número mayor o igual a 0.' });
	}
	return errors;
}

export function validateCloudEventInput(data: {
	name?: string;
	date?: string;
	pickup_date?: string;
	client_id?: string | number | null;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!data.name?.trim()) errors.push({ field: 'name', message: 'El título es obligatorio.' });
	if (!data.date?.trim()) errors.push({ field: 'date', message: 'La fecha de inicio es obligatoria.' });
	const endDate = data.pickup_date?.trim() || data.date?.trim();
	if (!endDate) errors.push({ field: 'pickup_date', message: 'La fecha de fin es obligatoria.' });
	if (data.date && endDate && endDate < data.date) {
		errors.push({ field: 'pickup_date', message: 'La fecha de fin no puede ser anterior a la de inicio.' });
	}
	if (data.client_id != null && data.client_id !== '' && Number(data.client_id) <= 0) {
		errors.push({ field: 'client_id', message: 'Seleccione un cliente válido.' });
	}
	return errors;
}

export function validateCloudCompanySettingsInput(data: {
	name?: string;
	email?: string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	const nameCheck = validateCompanySettingsInput({ name: data.name ?? '' });
	if (!nameCheck.valid) errors.push({ field: 'name', message: 'El nombre de la empresa es obligatorio.' });
	if (data.email?.trim() && !EMAIL_PATTERN.test(data.email.trim())) {
		errors.push({ field: 'email', message: 'El email no es válido.' });
	}
	return errors;
}

export function validateCloudMemberInput(data: {
	email?: string;
	role?: string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!data.email?.trim()) {
		errors.push({ field: 'email', message: 'El email es obligatorio.' });
	} else if (!EMAIL_PATTERN.test(data.email.trim())) {
		errors.push({ field: 'email', message: 'El email no es válido.' });
	}
	if (!data.role || !ASSIGNABLE_ROLES.includes(data.role as CompanyRole)) {
		errors.push({ field: 'role', message: 'Seleccione un rol válido.' });
	}
	return errors;
}

export function formErrorsToObject(errors: ValidationError[]): Record<string, string> {
	return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

export function firstFormError(errors: ValidationError[]): string | null {
	return errors[0]?.message ?? null;
}
