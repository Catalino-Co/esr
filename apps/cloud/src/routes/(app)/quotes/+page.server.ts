import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	SELECTABLE_STATES,
	parseQuoteStatus,
	quoteStatusParam,
	validateQuoteCanApprove
} from '@esr/core';
import type { Quote } from '@esr/schemas';
import { validateCreateQuoteInput } from '@esr/schemas';
import {
	getCustomerRepository,
	getEventRepository,
	getInventoryRepository,
	getQuoteRepository
} from '$lib/server/repositories';
import { recordAuditLog } from '$lib/server/audit';
import { requirePermission } from '$lib/server/permissions';
import { toTenantContext } from '$lib/server/tenant';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { companyId } = requirePermission(locals, 'quotes.view');
	const ctx = toTenantContext(companyId);
	const search = url.searchParams.get('search')?.trim() || undefined;

	// Sin `status` en la URL se listan los BORRADORES, que es lo que hay que
	// atender. Para ver el resto se cambia el selector.
	//
	// «Todas» viaja como `?status=todos` y NO como vacio: `FilterBar` e `irCon`
	// borran el parametro cuando el valor es `''`, asi que con un valor por
	// defecto que no es vacio la opcion «cualquier estado» se anularia a si
	// misma. `parseQuoteStatus` devuelve `undefined` para el centinela, que es
	// lo que el repositorio entiende como «sin filtro».
	const status = parseQuoteStatus(url.searchParams.get('status'));

	// Sin `state`: el listado ya no ofrece el eje de circulacion, y sin el
	// `appendStateFilter` del repositorio cae en `DEFAULT_RECORD_STATE`, que es
	// «activas». La columna sigue en la tabla y la usan los reportes.
	const quotes = await getQuoteRepository().list(ctx, { search, status, limit: 100, offset: 0 });

	// Estas dos listas hacen DOS trabajos: los mapas de nombres de la tabla y los
	// selects del dialogo de alta. Ya se cargaban para lo primero, asi que el
	// dialogo no cuesta ni una consulta mas.
	//
	// `SELECTABLE_STATES` —activos e inactivos, no archivados— es el mismo filtro
	// que usaba la pantalla `/quotes/new` que este dialogo sustituye. Sin el, el
	// repositorio cae en `DEFAULT_RECORD_STATE` y solo trae activos: la
	// cotizacion de un cliente inactivo enseñaba «—» en la columna Cliente.
	const customers = await getCustomerRepository().list(ctx, {
		state: SELECTABLE_STATES,
		limit: 500,
		offset: 0
	});
	const events = await getEventRepository().list(ctx, { limit: 500, offset: 0 });

	const customerMap = new Map(customers.map((c) => [c.id, c.name]));
	const eventMap = new Map(events.map((e) => [e.id, e.name]));

	return {
		quotes: quotes.map((quote) => ({
			...quote,
			client_name: quote.client_id ? customerMap.get(quote.client_id) ?? '—' : '—',
			event_name: quote.event_id ? eventMap.get(quote.event_id) ?? '—' : '—'
		})),
		customers,
		events,
		search: search ?? '',
		// El valor que tiene que marcar el selector, no el que fue al SQL: «sin
		// filtro» es `undefined` abajo y el centinela aqui.
		status: quoteStatusParam(status)
	};
};

/**
 * Tope de cotizaciones por lote.
 *
 * El listado enseña 100 como mucho, asi que «seleccionar todo» nunca pasa de
 * ahi. Un envio con mas ids no viene de esta pantalla, y sin tope una peticion
 * fabricada podria pedir cien mil comprobaciones de disponibilidad.
 */
const MAX_LOTE = 100;

/**
 * Los ids del formulario: sin repetidos, sin vacios y NUMERICOS.
 *
 * Lo de numericos no es adorno. `quotations.id` es BIGSERIAL, asi que un id que
 * no lo sea no llega a `findById` como «no encontrada»: revienta en el driver
 * con un `22P02` que nadie captura, y eso es un 500 donde tocaba un 400. Una
 * action es un endpoint publico y la basura merece una respuesta, no una traza.
 *
 * Repetidos fuera: dos casillas con el mismo id, o un POST hecho a mano, no
 * pueden dejar dos entradas de auditoria de la misma cotizacion.
 */
function leerIds(form: FormData): { ids: string[]; error?: string } {
	const crudos = form.getAll('ids').map((v) => String(v).trim()).filter(Boolean);
	if (!crudos.length) return { ids: [], error: 'No hay ninguna cotización seleccionada.' };
	if (crudos.some((v) => !/^\d+$/.test(v))) {
		return { ids: [], error: 'La selección contiene identificadores no válidos.' };
	}
	const ids = [...new Set(crudos)];
	if (ids.length > MAX_LOTE) {
		return { ids: [], error: `No se pueden procesar más de ${MAX_LOTE} a la vez.` };
	}
	return { ids };
}

/** Como se nombra una cotizacion en el parte de resultados. */
function etiqueta(quote: Quote): string {
	return quote.quote_number || `#${quote.id}`;
}

export const actions: Actions = {
	/**
	 * Alta de cotizacion, desde el dialogo de esta misma pantalla.
	 *
	 * Era la action `default` de `/quotes/new`, que ya no existe: aquel
	 * formulario de cuatro campos no justificaba abandonar el listado y volver
	 * por redireccion. Las tres guardas se conservan tal cual —el validador, que
	 * el evento sea de la empresa y que el cliente tambien lo sea—.
	 *
	 * Dos cosas cambian respecto al original:
	 *
	 * 1. Se acepta `conditions`. La columna existe desde el esquema inicial, el
	 *    repositorio la inserta y el generador de PDF la dibuja, pero en Cloud no
	 *    habia ni un campo donde escribirla: siempre valia NULL.
	 * 2. Todo `fail` devuelve `values`. Aqui no es un adorno: al fallar, el
	 *    dialogo se re-renderiza y sin esto se quedaria en blanco, que es lo que
	 *    hacia la pantalla vieja.
	 *
	 * Termina en `redirect`, asi que el exito nunca vuelve al cliente: el modal
	 * se va con la pagina y no hay que cerrarlo a mano.
	 */
	create: async ({ request, locals, getClientAddress }) => {
		// Mas estricto que el `load`, que se conforma con `quotes.view`.
		const { companyId } = requirePermission(locals, 'quotes.create');
		const ctx = toTenantContext(companyId);
		const form = await request.formData();

		const event_id = String(form.get('event_id') ?? '').trim();
		const client_id = String(form.get('client_id') ?? '').trim();
		const valid_until = String(form.get('valid_until') ?? '').trim();
		const notes = String(form.get('notes') ?? '').trim();
		const conditions = String(form.get('conditions') ?? '').trim();
		const values = { event_id, client_id, valid_until, notes, conditions };

		const validation = validateCreateQuoteInput({ client_id, event_id });
		if (!validation.valid) {
			return fail(400, { error: 'Evento y cliente son obligatorios.', values });
		}

		const event = await getEventRepository().findById(ctx, event_id);
		if (!event) return fail(404, { error: 'Evento no encontrado en su empresa.', values });

		const resolvedClientId = client_id || String(event.client_id || '');
		const customer = await getCustomerRepository().findById(ctx, resolvedClientId);
		if (!customer) return fail(400, { error: 'Cliente no pertenece a su empresa.', values });

		const quote = await getQuoteRepository().create(ctx, {
			client_id: resolvedClientId,
			event_id,
			notes: notes || undefined,
			conditions: conditions || undefined,
			valid_until: valid_until || undefined,
			date: event.date || new Date().toISOString().slice(0, 10),
			status: 'borrador',
			items: [],
			is_active: 1
		});

		await recordAuditLog(
			{ locals, request, getClientAddress },
			{
				action: 'quote.created',
				entity_type: 'quote',
				entity_id: String(quote.id),
				description: `Cotización creada ${quote.quote_number || quote.id}`
			}
		);

		throw redirect(303, `/quotes/${quote.id}`);
	},

	/**
	 * Aprobar varias cotizaciones de una vez.
	 *
	 * MEJOR ESFUERZO, no todo o nada. Si de diez hay tres sin disponibilidad,
	 * negarse a las siete buenas obliga a ir descartando a mano hasta dar con la
	 * culpable, y entonces el modo en bloque no ahorra nada. Se procesan una a
	 * una y se devuelve el parte de lo que no salio, por numero de cotizacion.
	 *
	 * Y las guardas NO se saltan: se comprueba la disponibilidad linea a linea
	 * igual que en la ficha. Es lo caro de esto, pero saltarselo convertiria este
	 * boton en la via para aprobar justo lo que la ficha no deja.
	 */
	approveMany: async ({ locals, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.approve');
		const ctx = toTenantContext(companyId);
		const { ids, error } = leerIds(await request.formData());
		if (error) return fail(400, { error });

		const hechas: string[] = [];
		const saltadas: string[] = [];

		/**
		 * Lo disponible de cada `articulo + ventana`, recordado durante el lote.
		 *
		 * Sin esto son N x M consultas: cien cotizaciones de ocho lineas son
		 * ochocientas idas y vueltas, cada una con dos subconsultas
		 * correlacionadas. Y el caso frecuente es justo el que se repite —varias
		 * cotizaciones del mismo evento pidiendo el mismo articulo en las mismas
		 * fechas—, asi que recordar la respuesta se lleva casi todo el coste por
		 * delante sin cambiar ni una regla.
		 *
		 * Vale dentro de una peticion y nada mas: se crea aqui y muere al acabar.
		 */
		const disponible = new Map<string, { ok: boolean; available: number }>();

		for (const id of ids) {
			// Esta lectura ES la comprobacion de inquilino: `findById` filtra por
			// `company_id`, asi que un id de otra empresa vuelve nulo y se salta.
			const quote = await getQuoteRepository().findById(ctx, id);
			if (!quote) {
				saltadas.push(`#${id}: no encontrada`);
				continue;
			}

			// Reaprobar una ya aprobada no cambia la fila —`changeStatus` protege
			// `confirmed_at` con COALESCE— pero SI dejaria una entrada de auditoria
			// de una aprobacion que no ocurrio. `validateQuoteCanApprove` lo
			// permite porque desde la ficha es un gesto deliberado; en un lote de
			// cuarenta es ruido.
			if (quote.status === 'aprobada') {
				saltadas.push(`${etiqueta(quote)}: ya estaba aprobada`);
				continue;
			}

			const items = await getQuoteRepository().listItems(ctx, id);
			const permitido = validateQuoteCanApprove(quote, items);
			if (!permitido.ok) {
				saltadas.push(`${etiqueta(quote)}: ${quote.status}`);
				continue;
			}

			let falta: string | null = null;
			for (const item of items) {
				if (!item.item_id) continue;
				const desde = item.start_date || quote.date || undefined;
				const hasta = item.end_date || undefined;
				const clave = `${item.item_id}|${desde ?? ''}|${hasta ?? ''}|${item.quantity}`;

				let check = disponible.get(clave);
				if (!check) {
					check = await getInventoryRepository().checkAvailability(
						ctx,
						item.item_id,
						Number(item.quantity || 0),
						desde,
						hasta
					);
					disponible.set(clave, check);
				}

				if (!check.ok) {
					falta = `${item.name} (pide ${item.quantity}, hay ${check.available})`;
					break;
				}
			}
			if (falta) {
				saltadas.push(`${etiqueta(quote)}: sin disponibilidad de ${falta}`);
				continue;
			}

			await getQuoteRepository().changeStatus(ctx, id, 'aprobada');
			hechas.push(etiqueta(quote));

			// UNA entrada por cotizacion, no una por lote: la pregunta que alguien
			// hace tres meses despues es «¿quién aprobó la COT-000012?», y una sola
			// fila de lote no la contesta. El tamaño del lote va en los metadatos
			// para poder distinguir un aprobado suelto de uno en bloque.
			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'quote.approved',
				entity_type: 'quote',
				entity_id: String(id),
				description: `Cotización aprobada ${etiqueta(quote)}`,
				metadata: { lote: ids.length }
			});
		}

		return { bulk: { accion: 'aprobar', hechas: hechas.length, saltadas } };
	},

	/**
	 * Cancelar varias cotizaciones de una vez.
	 *
	 * Misma disciplina que arriba. Aqui la unica guarda es que una CONVERTIDA no
	 * se cancela: ya hay una orden colgando de ella.
	 *
	 * No redirige, a diferencia de la accion de la ficha: la lista YA es esta
	 * pantalla, y `use:enhance` necesita quedarse para repintar la tabla y
	 * enseñar el parte.
	 */
	cancelMany: async ({ locals, request, getClientAddress }) => {
		const { companyId } = requirePermission(locals, 'quotes.cancel');
		const ctx = toTenantContext(companyId);
		const { ids, error } = leerIds(await request.formData());
		if (error) return fail(400, { error });

		const hechas: string[] = [];
		const saltadas: string[] = [];

		for (const id of ids) {
			const quote = await getQuoteRepository().findById(ctx, id);
			if (!quote) {
				saltadas.push(`#${id}: no encontrada`);
				continue;
			}
			if (quote.status === 'convertida') {
				saltadas.push(`${etiqueta(quote)}: ya convertida en orden`);
				continue;
			}
			// Ya cancelada: se salta en silencio contado, no es un error. Alguien
			// pudo cancelarla desde otra pestaña mientras este lote iba en camino.
			if (quote.status === 'cancelada') {
				saltadas.push(`${etiqueta(quote)}: ya estaba cancelada`);
				continue;
			}

			await getQuoteRepository().changeStatus(ctx, id, 'cancelada');
			hechas.push(etiqueta(quote));

			await recordAuditLog({ locals, request, getClientAddress }, {
				action: 'quote.cancelled',
				entity_type: 'quote',
				entity_id: String(id),
				description: `Cotización cancelada ${etiqueta(quote)}`,
				metadata: { lote: ids.length }
			});
		}

		return { bulk: { accion: 'cancelar', hechas: hechas.length, saltadas } };
	}
};
