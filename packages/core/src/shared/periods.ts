import { todayISO } from './format';

/**
 * Periodos de consulta: el mes, el trimestre y el año EN CURSO.
 *
 * Son los tres unicos rangos que la aplicacion carga sola. Para ver mas de un
 * año hay que teclear las fechas a mano, y eso es deliberado: un listado que por
 * defecto trae toda la historia deja lo de esta semana enterrado bajo lo del año
 * pasado.
 *
 * Trimestre NATURAL —tres meses, Q1 a Q4—, no cuatrimestre: es el corte con el
 * que casan los cierres contables.
 */
export const PERIODOS = ['mes', 'trimestre', 'anio'] as const;

export type Periodo = (typeof PERIODOS)[number];

export const PERIODO_LABELS: Record<Periodo, string> = {
	mes: 'Mes',
	trimestre: 'Trimestre',
	anio: 'Año'
};

/** Lo que ve una empresa que nunca abrio Configuracion › Generales. */
export const DEFAULT_PERIODO: Periodo = 'mes';

export function isPeriodo(valor: unknown): valor is Periodo {
	return typeof valor === 'string' && (PERIODOS as readonly string[]).includes(valor);
}

/** Ausente o basura → el por defecto. Nunca lanza: esto sanea entrada externa. */
export function parsePeriodo(valor: unknown): Periodo {
	return isPeriodo(valor) ? valor : DEFAULT_PERIODO;
}

export type RangoFechas = { desde: string; hasta: string };

/**
 * El rango `YYYY-MM-DD` del periodo que contiene `hoy`, ambos extremos
 * inclusive.
 *
 * Todo el calculo va en HORA LOCAL, apoyado en `todayISO`, que es la funcion
 * que ya resuelve ese problema en el resto del sistema: `toISOString()` da el
 * dia en UTC y en un huso negativo adelanta la fecha a partir de las 20h, asi
 * que el «mes actual» empezaria un dia antes de tiempo cada 31 dias.
 *
 * El truco del ultimo dia es `new Date(y, m + 1, 0)`: el dia CERO del mes
 * siguiente es el ultimo del actual, y el motor ya sabe de bisiestos.
 */
export function rangoDelPeriodo(periodo: Periodo, hoy: Date = new Date()): RangoFechas {
	const y = hoy.getFullYear();
	const m = hoy.getMonth();

	if (periodo === 'anio') {
		return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
	}

	if (periodo === 'trimestre') {
		const primerMes = Math.floor(m / 3) * 3;
		return {
			desde: todayISO(new Date(y, primerMes, 1)),
			hasta: todayISO(new Date(y, primerMes + 3, 0))
		};
	}

	return { desde: todayISO(new Date(y, m, 1)), hasta: todayISO(new Date(y, m + 1, 0)) };
}

/**
 * El reverso, y existe para UNA cosa: saber que boton de rango rapido va
 * encendido.
 *
 * Devuelve `null` cuando las fechas se tecleron a mano y no casan con ningun
 * periodo, que es la verdad: encender uno a medias mentiria sobre lo que se
 * esta viendo.
 */
export function periodoDeRango(
	desde: string | null | undefined,
	hasta: string | null | undefined,
	hoy: Date = new Date()
): Periodo | null {
	if (!desde || !hasta) return null;
	for (const periodo of PERIODOS) {
		const rango = rangoDelPeriodo(periodo, hoy);
		if (rango.desde === desde && rango.hasta === hasta) return periodo;
	}
	return null;
}
