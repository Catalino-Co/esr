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

export function isQuoteStatus(value: unknown): value is QuoteStatusValue {
	return QUOTE_STATUSES.includes(String(value) as QuoteStatusValue);
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
 * Las mismas opciones con «cualquier estado» delante, con `''` como valor.
 *
 * `''` y no un centinela aparte: el listado no impone un estado por defecto
 * —entra por «cualquier estado»—, asi que no hay ningun default no vacio del
 * que distinguir el vacio. Es el mismo trato que ya tienen los nueve filtros
 * de estado de circulacion y el select de Ordenes.
 */
export function quoteStatusFilterOptions(): Array<{ value: string; label: string; tone?: string }> {
	return [{ value: '', label: 'Cualquier estado' }, ...quoteStatusOptions()];
}

function tonoDePunto(estado: QuoteStatusValue): string {
	const { tone } = statusInfo(estado);
	if (tone === 'success') return 'ok';
	if (tone === 'warning') return 'warn';
	if (tone === 'danger') return 'off';
	return 'none';
}
