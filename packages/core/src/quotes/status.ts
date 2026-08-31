import { statusInfo, statusLabel } from '../shared/business-status';

/**
 * Los estados de negocio de una cotizacion, como LISTA RECORRIBLE.
 *
 * Existe porque `business-status.ts` da etiqueta y tono pero su mapa es privado
 * y mezcla todos los dominios: no se puede recorrer para construir un select.
 * Consecuencia: cada pantalla escribia la lista a mano, y dejaron de coincidir.
 * Cloud ofrecia estos cuatro; el editor de ESR Pro ofrecia
 * `borrador, enviada, aprobada, rechazada, vencida`, o sea que **no habia forma
 * de cancelar ni de convertir una cotizacion desde el escritorio**, que son los
 * dos estados que el negocio si usa.
 *
 * Esta es la misma forma que `shared/record-state.ts` le dio al OTRO eje —el de
 * circulacion— y que alli lleva funcionando desde el principio.
 *
 * Las etiquetas y los colores NO se duplican aqui: siguen saliendo de
 * `business-status.ts`, que es su sitio. Este archivo aporta la lista y la
 * semantica del filtro, nada mas.
 *
 * Los tres que faltan —`enviada`, `rechazada`, `vencida`— existen en el mapa de
 * etiquetas pero no los escribe ningun camino de la aplicacion. Se dejan fuera
 * del selector en vez de ofrecer filtros que nunca devuelven nada.
 */
export const QUOTE_STATUSES = ['borrador', 'aprobada', 'cancelada', 'convertida'] as const;

export type QuoteStatusValue = (typeof QUOTE_STATUSES)[number];

/** Con lo que entra el listado si nadie pide otra cosa. */
export const DEFAULT_QUOTE_STATUS: QuoteStatusValue = 'borrador';

/**
 * El centinela de «todas», y no la cadena vacia.
 *
 * No es un capricho. `FilterBar` de Cloud e `irCon` BORRAN el parametro cuando
 * el valor es `''`, y con un valor por defecto que no es vacio eso es una
 * trampa cerrada: elegir «cualquier estado» quitaria `status` de la URL, el
 * `load` volveria a poner `borrador` y no habria forma de ver todas.
 *
 * Es el primer filtro que necesita distinguir «vacio» de «sin especificar»: los
 * nueve que hoy tienen un valor por defecto —el eje de circulacion— lo esquivan
 * eliminando la vista «todos», que aqui no vale.
 */
export const QUOTE_STATUS_ALL = 'todos';

export function isQuoteStatus(value: unknown): value is QuoteStatusValue {
	return QUOTE_STATUSES.includes(String(value) as QuoteStatusValue);
}

/**
 * Lo que el filtro le pasa al repositorio.
 *
 * `undefined` significa «sin filtro», que es lo que los dos repositorios ya
 * entienden: aplican `status` con un `if`, asi que ausente es «todas».
 *
 * Ausente o basura caen en el por defecto, igual que hace `parseRecordState`:
 * un `?status=loquesea` no debe vaciar la lista.
 */
export function parseQuoteStatus(value: string | null | undefined): QuoteStatusValue | undefined {
	const clave = (value ?? '').trim().toLowerCase();
	if (clave === QUOTE_STATUS_ALL) return undefined;
	return isQuoteStatus(clave) ? clave : DEFAULT_QUOTE_STATUS;
}

/**
 * Lo contrario de `parseQuoteStatus`: el valor que tiene que marcar el select.
 *
 * Hace falta porque «sin filtro» viaja como `undefined` hacia el repositorio
 * pero el control necesita el centinela para poder seguir seleccionado.
 */
export function quoteStatusParam(value: QuoteStatusValue | undefined): string {
	return value ?? QUOTE_STATUS_ALL;
}

/** Opciones del selector, con el punto de color que pide `StatusSelect`. */
export function quoteStatusOptions(): Array<{ value: string; label: string; tone: string }> {
	return QUOTE_STATUSES.map((estado) => ({
		value: estado,
		label: statusLabel(estado),
		// `StatusSelect` habla de `ok | warn | off`; `statusInfo` de
		// `success | warning | danger | neutral`. Se traduce aqui y no en cada
		// pantalla.
		tone: tonoDePunto(estado)
	}));
}

/**
 * Las mismas opciones con «cualquier estado» delante, que es como las quiere un
 * filtro. El centinela va en el `value`.
 */
export function quoteStatusFilterOptions(): Array<{ value: string; label: string; tone?: string }> {
	return [{ value: QUOTE_STATUS_ALL, label: 'Cualquier estado' }, ...quoteStatusOptions()];
}

function tonoDePunto(estado: QuoteStatusValue): string {
	const { tone } = statusInfo(estado);
	if (tone === 'success') return 'ok';
	if (tone === 'warning') return 'warn';
	if (tone === 'danger') return 'off';
	return 'none';
}
