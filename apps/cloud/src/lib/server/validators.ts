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

/**
 * El ARTICULO, que ya no lleva existencias: la cantidad dejo de venir por este
 * formulario y entra por un movimiento de inventario, que si dice cuando, a que
 * almacen y quien la puso.
 *
 * Se validan los dos precios porque un precio negativo no es una tarifa, es un
 * error de tecleo que se propagaria a cada cotizacion que copie ese valor.
 */
export function validateCloudInventoryInput(data: {
	name?: string;
	rental_price?: number | string;
	internal_cost?: number | string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!data.name?.trim()) errors.push({ field: 'name', message: 'El nombre es obligatorio.' });
	for (const [field, label] of [
		['rental_price', 'El precio de alquiler'],
		['internal_cost', 'El precio de compra']
	] as const) {
		const valor = data[field];
		if (valor === undefined || valor === '') continue;
		const n = Number(valor);
		if (Number.isNaN(n) || n < 0) {
			errors.push({ field, message: `${label} debe ser un número mayor o igual a 0.` });
		}
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

/**
 * Tope de lo que se acepta como logotipo, en caracteres del data URL.
 *
 * Algo mas alto que el que aplica el cliente (300 KB): asi un margen de
 * codificacion no rechaza un logo legitimo, pero sigue acotando el disparate.
 */
const MAX_LOGO_CHARS = 400_000;

/** Los dos unicos prefijos que se admiten, exactos. */
const LOGO_PREFIJOS = ['data:image/png;base64,', 'data:image/jpeg;base64,'] as const;

/** Firmas de archivo, para comprobar que los bytes son lo que la etiqueta dice. */
const FIRMAS: Record<string, number[]> = {
	'data:image/png;base64,': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
	'data:image/jpeg;base64,': [0xff, 0xd8, 0xff]
};

/**
 * El logotipo que llega por el formulario.
 *
 * Una action es un endpoint publico: el `<input type="file">` y el reescalado
 * del navegador no protegen nada. Aqui esta autenticado y con permiso de
 * configuracion, asi que el atacante no es internet, pero el techo sigue
 * haciendo falta: `getCompanySettingsRepository().get()` trae esta columna, y la
 * llaman las pantallas de cotizacion y de inventario solo para leer la tasa de
 * impuesto. Un pegote de 50 MB ahi se arrastra a memoria en cada una.
 *
 * Las comprobaciones van de la mas barata a la mas cara: no se le pasa una
 * expresion regular a una cadena de 50 MB si la longitud ya la descarta.
 */
export function validateCloudLogoDataUrl(valor: string): ValidationError[] {
	const error = (message: string) => [{ field: 'logo_base64', message }];

	if (valor.length > MAX_LOGO_CHARS) return error('El logotipo pesa demasiado.');

	const prefijo = LOGO_PREFIJOS.find((p) => valor.startsWith(p));
	// Lista blanca y no lista negra. Esto es lo que corta `javascript:`,
	// `data:text/html` y sobre todo `data:image/svg+xml`: un SVG puede llevar
	// script dentro, y jsPDF ademas no sabe dibujarlo —entraria en su `catch`
	// mudo y el documento saldria sin logo y sin avisar.
	if (!prefijo) return error('El logotipo tiene que ser un PNG o un JPG.');

	const datos = valor.slice(prefijo.length);
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(datos)) return error('El logotipo está mal codificado.');

	// Bytes magicos: que la firma case con el tipo DECLARADO. Sin esto, un PNG
	// etiquetado como JPEG pasaria, y es justo el caso que hace que el generador
	// de PDF acierte la etiqueta y falle los bytes.
	const firma = FIRMAS[prefijo];
	const cabeza = Buffer.from(datos.slice(0, 24), 'base64');
	if (firma.some((byte, i) => cabeza[i] !== byte)) {
		return error('El archivo no es la imagen que dice ser.');
	}

	return [];
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

/**
 * Edicion de la cuenta de un usuario. Se separa de `validateCloudMemberInput`
 * porque el alta solo pide email y rol, mientras que la edicion escribe ademas
 * el nombre en `users`, que es la identidad GLOBAL.
 */
export function validateCloudUserInput(data: {
	name?: string;
	email?: string;
	role?: string;
}): ValidationError[] {
	const errors: ValidationError[] = [];
	if (!data.name?.trim()) {
		errors.push({ field: 'name', message: 'El nombre es obligatorio.' });
	}
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
