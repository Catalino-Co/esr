/**
 * Capa de formato de la interfaz.
 *
 * La regla del sistema de diseño es que ningun template pinte un valor de base
 * de datos tal cual. Aqui viven las tres conversiones que hacen falta para eso:
 * dinero, fechas y el hueco vacio.
 *
 * NO se reutiliza `@esr/reports/formatters`: aquel formatea en `en-US`, sin
 * simbolo de moneda, y su `formatDate` es un `slice(0, 10)` que devuelve la
 * fecha ISO intacta. Sirve para los PDF, que no tienen ni tema ni idioma del
 * usuario, pero no para la pantalla.
 */

/**
 * Moneda y region. Deberian salir de la empresa, pero hoy no existe el campo:
 * ni `companies` ni `company_info` tienen columna de moneda. Cuando exista, se
 * cambia AQUI y solo aqui.
 */
export const LOCALE = 'es-DO';
export const CURRENCY = 'DOP';

/** Lo que se pinta donde no hay dato. Nunca cadena vacia, nunca `null`. */
export const EMPTY = '—';

/** `null`, `undefined` y la cadena vacia se convierten en un guion largo. */
export function dash(value: unknown): string {
	if (value === null || value === undefined) return EMPTY;
	const text = String(value).trim();
	return text === '' ? EMPTY : text;
}

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
	style: 'currency',
	currency: CURRENCY,
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

/** `1500.5` → `RD$1,500.50`. Un valor no numerico cae en cero, no en `NaN`. */
export function formatMoney(value: unknown): string {
	const amount = Number(value);
	return moneyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

const numberFormatter = new Intl.NumberFormat(LOCALE);

/** Enteros con separador de miles: `1500` → `1,500`. */
export function formatNumber(value: unknown): string {
	const amount = Number(value);
	return numberFormatter.format(Number.isFinite(amount) ? amount : 0);
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

/**
 * `20 jun 2026`, no `20 jun de 2026`.
 *
 * El formato corto en español intercala un «de» antes del año y a veces un
 * punto tras el mes abreviado. Se arma desde las partes en vez de limpiar la
 * cadena a posteriori, que dependeria de la version de ICU del entorno.
 */
function formatoCorto(date: Date): string {
	const partes = dateFormatter.formatToParts(date);
	const parte = (type: Intl.DateTimeFormatPartTypes) =>
		partes.find((p) => p.type === type)?.value ?? '';
	const mes = parte('month').replace(/\.$/, '');
	return `${parte('day')} ${mes} ${parte('year')}`;
}

const MS_POR_DIA = 86_400_000;

/**
 * Convierte a `Date` sin sorpresas de zona horaria.
 *
 * `new Date('2026-06-20')` se interpreta como UTC y en un huso negativo —el
 * nuestro— retrocede al dia 19. Una fecha sin hora es un dia del calendario,
 * no un instante, asi que se construye en local.
 */
function toDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === '') return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

	const text = String(value);
	const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
	if (soloFecha) {
		const [, y, m, d] = soloFecha;
		return new Date(Number(y), Number(m) - 1, Number(d));
	}

	const parsed = new Date(text);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Dias completos entre dos fechas, contando por dia del calendario. */
function diasDeDiferencia(fecha: Date, ahora: Date): number {
	const a = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
	const b = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
	return Math.round((b.getTime() - a.getTime()) / MS_POR_DIA);
}

/**
 * `20 jun 2026`. Dentro de la semana, relativo: «hoy», «ayer», «hace 3 dias»,
 * «en 2 dias». Lo que no es una fecha se devuelve como guion.
 */
export function formatDate(value: unknown, ahora: Date = new Date()): string {
	const date = toDate(value);
	if (!date) return EMPTY;

	const dias = diasDeDiferencia(date, ahora);
	if (dias === 0) return 'hoy';
	if (dias === 1) return 'ayer';
	if (dias === -1) return 'mañana';
	if (dias > 1 && dias < 7) return `hace ${dias} días`;
	if (dias < -1 && dias > -7) return `en ${Math.abs(dias)} días`;

	return formatoCorto(date);
}

/** Fecha absoluta siempre, sin la forma relativa. Para columnas y tablas. */
export function formatDateAbsolute(value: unknown): string {
	const date = toDate(value);
	return date ? formatoCorto(date) : EMPTY;
}

/**
 * «hace 4 minutos». Para el sello de actualizacion de una pantalla, donde la
 * unidad util son minutos y no dias.
 */
export function formatRelativeTime(value: unknown, ahora: Date = new Date()): string {
	const date = toDate(value);
	if (!date) return EMPTY;

	const segundos = Math.max(0, Math.round((ahora.getTime() - date.getTime()) / 1000));
	if (segundos < 60) return 'hace un momento';

	const minutos = Math.round(segundos / 60);
	if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;

	const horas = Math.round(minutos / 60);
	if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;

	return formatDate(date, ahora);
}
