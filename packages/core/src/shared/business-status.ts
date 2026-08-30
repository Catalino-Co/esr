/**
 * Etiquetas de los estados de NEGOCIO.
 *
 * Es un eje distinto del estado de circulacion de `record-state.ts`: una
 * cotizacion puede estar `aprobada` (negocio) y `archivada` (circulacion).
 *
 * Existe porque hasta ahora los enums se pintaban crudos —`parcialmente_devuelto`
 * en pantalla— y porque sus valores estan repartidos en listas que no coinciden
 * entre si: el tipo de `@esr/schemas`, las constantes de `operations/use-cases`
 * y las opciones de cada filtro declaran conjuntos distintos. El SQL ademas casi
 * nunca tiene `CHECK`, asi que la base acepta cualquier cadena.
 *
 * Por eso `statusLabel` NUNCA falla ni deja pasar el valor crudo: lo que no
 * conoce lo humaniza.
 */

/** Los cuatro tonos que el sistema de diseño ya usa en sus badges. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export type StatusInfo = { label: string; tone: StatusTone };

/**
 * Union de TODOS los valores observados, vengan del tipo, de la maquina de
 * estados o del filtro. Es deliberadamente generosa: sobra una entrada que no
 * se use, falta una y el usuario ve `en_preparacion`.
 */
const STATUS: Record<string, StatusInfo> = {
	// Cotizaciones
	borrador: { label: 'Borrador', tone: 'neutral' },
	enviada: { label: 'Enviada', tone: 'neutral' },
	aprobada: { label: 'Aprobada', tone: 'success' },
	rechazada: { label: 'Rechazada', tone: 'danger' },
	convertida: { label: 'Convertida', tone: 'success' },
	vencida: { label: 'Vencida', tone: 'warning' },

	// Ordenes de trabajo
	pendiente: { label: 'Pendiente', tone: 'neutral' },
	confirmado: { label: 'Confirmado', tone: 'neutral' },
	en_preparacion: { label: 'En preparación', tone: 'warning' },
	preparado: { label: 'Preparado', tone: 'warning' },
	cargado: { label: 'Cargado', tone: 'warning' },
	entregado: { label: 'Entregado', tone: 'success' },
	parcialmente_devuelto: { label: 'Parcialmente devuelto', tone: 'warning' },
	devuelto: { label: 'Devuelto', tone: 'success' },
	retornado: { label: 'Retornado', tone: 'success' },
	cerrado: { label: 'Cerrado', tone: 'neutral' },

	// Cobros
	pagado: { label: 'Pagado', tone: 'success' },
	anulado: { label: 'Anulado', tone: 'danger' },

	// Conduces. `entrega` y `devolucion` no son estados sino TIPOS de conduce,
	// pero se pintan por la misma funcion y sin estas dos entradas salian
	// humanizados: «Devolucion», sin tilde.
	entrega: { label: 'Entrega', tone: 'neutral' },
	devolucion: { label: 'Devolución', tone: 'neutral' },
	emitido: { label: 'Emitido', tone: 'neutral' },
	completado: { label: 'Completado', tone: 'success' },

	// Facturas. Van en femenino y por eso no comparten clave con el conduce:
	// `emitido` y `emitida` son dos entradas distintas a proposito.
	emitida: { label: 'Emitida', tone: 'neutral' },
	anulada: { label: 'Anulada', tone: 'danger' },
	facturada: { label: 'Facturada', tone: 'success' },
	pendiente_de_facturar: { label: 'Pendiente de facturar', tone: 'warning' },

	// Lineas de conduce y de orden: estas nacieron en ingles y siguen asi en la
	// base. Se traducen aqui para que no lleguen crudas a la pantalla.
	pending: { label: 'Pendiente', tone: 'neutral' },
	completed: { label: 'Completado', tone: 'success' },
	reserved: { label: 'Reservado', tone: 'neutral' },
	'dañado': { label: 'Dañado', tone: 'danger' },
	perdido: { label: 'Perdido', tone: 'danger' },

	// Movimientos de stock. Nacieron en ingles y siguen asi en la base. Los
	// `reverso_*` los escribe la anulacion de un conduce en modo operacion: la
	// bitacora no se borra, se compensa con el movimiento contrario.
	delivered: { label: 'Entregado', tone: 'neutral' },
	returned: { label: 'Devuelto', tone: 'neutral' },
	damaged: { label: 'Dañado', tone: 'danger' },
	lost: { label: 'Perdido', tone: 'danger' },
	reverso_delivered: { label: 'Reverso de entrega', tone: 'warning' },
	reverso_returned: { label: 'Reverso de devolución', tone: 'warning' },
	reverso_damaged: { label: 'Reverso de daño', tone: 'warning' },
	reverso_lost: { label: 'Reverso de pérdida', tone: 'warning' },

	// Eventos
	tentativo: { label: 'Tentativo', tone: 'warning' },

	// Incidencias
	reportado: { label: 'Reportado', tone: 'warning' },
	resuelto: { label: 'Resuelto', tone: 'success' },

	// Transversal
	cancelado: { label: 'Cancelado', tone: 'danger' },
	cancelada: { label: 'Cancelada', tone: 'danger' }
};

/**
 * Ultimo recurso para un valor que no esta en el mapa: `en_recogida` sale
 * «En recogida». Feo pero legible, y nunca deja ver el enum tal cual.
 */
function humanizar(valor: string): string {
	const limpio = valor.replace(/[_-]+/g, ' ').trim();
	if (!limpio) return '—';
	return limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase();
}

export function statusInfo(value: unknown): StatusInfo {
	if (value === null || value === undefined) return { label: '—', tone: 'neutral' };
	const clave = String(value).trim().toLowerCase();
	if (clave === '') return { label: '—', tone: 'neutral' };
	return STATUS[clave] ?? { label: humanizar(clave), tone: 'neutral' };
}

export function statusLabel(value: unknown): string {
	return statusInfo(value).label;
}

/** Clase de badge del sistema de diseño para el tono de un estado. */
export function statusBadgeClass(value: unknown): string {
	const { tone } = statusInfo(value);
	if (tone === 'success') return 'badge-success';
	if (tone === 'warning') return 'badge-warning';
	if (tone === 'danger') return 'badge-danger';
	return 'badge-muted';
}
