<script>
	import { applyAction, enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import {
		calculateQuoteLineAmounts,
		calculateQuoteLineTotal,
		calculateQuoteTotals,
		formatMoney,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';
	import { Icon, PdfPreviewModal } from '@esr/ui';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	/**
	 * `$derived`, NO una desestructuración suelta.
	 *
	 * `const { x } = data` se evalúa UNA vez al montar. Al navegar entre dos
	 * registros de la misma ruta, SvelteKit reutiliza el componente y solo
	 * cambia `data`: la pantalla se quedaba enseñando el registro anterior con
	 * la URL del nuevo.
	 */
	const quote = $derived(data.quote);
	const canEdit = $derived(data.canEdit);

	// `canEdit` es la regla de negocio (estado de la cotización);
	// `can(...)` es la regla de rol. Ambas deben cumplirse.
	const mayEdit = $derived(canEdit && can('quotes.update'));

	/**
	 * El nombre de la action va el ÚLTIMO: `?/updateItem` a secas BORRA el resto
	 * de la query string. Hoy esta ficha no lleva ninguna, pero el patrón es
	 * gratis y evita que el día que se añada un `?tab=` alguien pierda la tarde.
	 */
	const accion = (nombre) => {
		const qs = page.url.search.replace(/^\?/, '');
		return qs ? `?${qs}&/${nombre}` : `?/${nombre}`;
	};

	/* ── Recálculo natural ──────────────────────────────────────────────────
	 *
	 * Hay DOS verdades y son la misma función: `calculateQuoteTotals` es lo que
	 * ejecuta `syncTotals` en el servidor y lo que ejecuta esta pantalla. No hay
	 * dos algoritmos que puedan divergir.
	 *
	 * El servidor sigue siendo la fuente de verdad de lo PERSISTIDO; el cliente
	 * lo es de lo que se está VIENDO. Por eso el total cambia con la tecla y no
	 * con el viaje de red, y por eso desapareció el botón «Recalcular».
	 */

	/**
	 * Borrador de la cabecera. Se re-siembra solo cuando cambia el registro.
	 *
	 * Los dos TEXTOS. El descuento y el impuesto salieron de aqui: eran dos
	 * importes tecleados a mano que no guardaban relacion con lo cotizado.
	 * Ahora cada linea lleva su tasa y la cabecera enseña la suma.
	 *
	 * `conditions` es nuevo aqui. La columna existia desde el esquema inicial y
	 * el PDF ya la dibujaba, pero en Cloud no habia donde escribirla: siempre
	 * valia NULL y el bloque «Condiciones:» no salia nunca.
	 */
	let borrador = $state({ notes: '', conditions: '' });

	$effect(() => {
		// Dependencia explícita del id: SvelteKit reutiliza el componente entre
		// /quotes/3 y /quotes/4 y el borrador del anterior sobreviviría.
		void data.quote.id;
		borrador = {
			notes: data.quote.notes ?? '',
			conditions: data.quote.conditions ?? ''
		};
	});

	/**
	 * Las líneas, tal como se pintan.
	 *
	 * Sin superposición optimista: desde que la tabla es de solo lectura y se
	 * edita por diálogo, no hay nada que teclear sobre ella. El diálogo guarda,
	 * `update()` invalida y esto se repinta con lo que hay en la base.
	 *
	 * `Number(...)` no es decorativo: `quotation_items.price` es NUMERIC y `pg`
	 * no tiene type parser, así que llega como cadena «150.00».
	 */
	const lineas = $derived(
		data.items.map((item) => {
			const linea = {
				...item,
				quantity: Number(item.quantity) || 0,
				price: Number(item.price) || 0,
				discount_rate: Number(item.discount_rate) || 0,
				tax_rate: Number(item.tax_rate) || 0
			};
			return {
				...linea,
				total: calculateQuoteLineTotal(linea),
				importes: calculateQuoteLineAmounts({ ...linea, total: undefined })
			};
		})
	);

	// Sin parametros: los totales son la SUMA de las lineas, no dos importes
	// tecleados. Misma funcion que ejecuta `syncTotals` en el servidor.
	const totales = $derived(calculateQuoteTotals(lineas));

	/* ── Persistencia: debounce, blur y salida ─────────────────────────────── */

	let guardando = $state(false);
	let guardadoOk = $state(false);
	let errorGuardado = $state(null);

	/** Un guardado por formulario, sin solapes. */
	const pendientes = new Map();
	const formularios = $state({});

	function programar(formEl, inmediato = false) {
		if (!formEl) return;
		const p = pendientes.get(formEl) ?? { timer: null, enVuelo: false, repetir: false };
		pendientes.set(formEl, p);
		clearTimeout(p.timer);

		const lanzar = () => {
			p.timer = null;
			// SvelteKit no serializa dos POST a la misma action. Dos `updateQuote`
			// solapados son un read-modify-write entrelazado sobre la misma fila.
			if (p.enVuelo) {
				p.repetir = true;
				return;
			}
			formEl.requestSubmit();
		};

		if (inmediato) lanzar();
		// 700 y no los 300 del buscador de los listados: allí el debounce protege
		// una LECTURA; aquí una ESCRITURA que son cuatro consultas. Teclear «1250»
		// produce un guardado, no tres.
		else p.timer = setTimeout(lanzar, 700);
	}

	const alGuardar = (formEl) => () => {
		const p = pendientes.get(formEl) ?? { timer: null, enVuelo: false, repetir: false };
		pendientes.set(formEl, p);
		p.enVuelo = true;
		guardando = true;

		return async ({ result }) => {
			p.enVuelo = false;
			guardando = false;

			if (result.type === 'failure') {
				// Un guardado que aterriza después de que otro usuario convierta la
				// cotización devuelve `fail(400)`. Como abajo NO se llama a
				// `update()`, la pantalla no se enteraría y seguiría aceptando
				// teclas sobre un documento bloqueado.
				errorGuardado = result.data?.error ?? 'No se pudo guardar.';
				guardadoOk = false;
				const { invalidateAll } = await import('$app/navigation');
				await invalidateAll();
				return;
			}

			errorGuardado = null;
			guardadoOk = true;
			if (p.repetir) {
				p.repetir = false;
				programar(formEl, true);
			}

			/* NO se llama a `update()` ni a `applyAction()`, y es deliberado:
			 *
			 *  1. `update()` resetea el <form>, y el reset devuelve cada input a su
			 *     `defaultValue` —el atributo HTML—, que Svelte nunca escribe porque
			 *     asigna `value` como PROPIEDAD. Los campos se vaciaban al guardar.
			 *  2. Su `invalidateAll` repintaría la tabla de líneas mientras se
			 *     escribe dentro de ella.
			 *  3. El indicador diría «Guardado» parpadeando cada 700 ms.
			 *
			 * Nada de esta pantalla lee `quote.total` después de esto: los totales
			 * salen del cálculo local, y el PDF se los pide al servidor.
			 */
		};
	};

	beforeNavigate(({ type }) => {
		const sucios = [...pendientes.entries()].filter(([, p]) => p.timer || p.enVuelo);
		if (!sucios.length) return;

		for (const [formEl, p] of sucios) {
			if (p.enVuelo) continue;
			if (type === 'leave') {
				// La pestaña se va: un `fetch` normal muere a medio vuelo. `sendBeacon`
				// es lo único que sobrevive al `unload`, y una action de SvelteKit
				// acepta exactamente ese POST multipart.
				navigator.sendBeacon?.(
					`${page.url.pathname}${accion('updateQuote').replace(/^\?/, '?')}`,
					new FormData(formEl)
				);
			} else {
				// Navegación interna: la página NO se recarga, así que el `fetch` que
				// lanza `use:enhance` sigue vivo después de cambiar de ruta. Basta con
				// dispararlo ya, sin cancelar la navegación.
				clearTimeout(p.timer);
				p.timer = null;
				formEl.requestSubmit();
			}
		}
	});

	/* ── Diálogo: agregar artículo ─────────────────────────────────────────── */

	let agregandoArticulo = $state(false);
	let errorArticulo = $state(null);
	let busqueda = $state('');
	let seleccion = $state(null);
	let alta = $state({ quantity: 1, price: 0, discount_rate: 0, tax_rate: 0 });

	/**
	 * Las tasas que se proponen para una línea NUEVA.
	 *
	 * El impuesto sale de Configuración › Generales; el descuento nace en cero
	 * porque es una negociación de esta línea, no una propiedad de la empresa.
	 *
	 * Antes esto adivinaba «las tasas de la última línea», un parche de cuando
	 * no había ajuste. Ahora hay un valor de verdad, y dos fuentes para lo mismo
	 * acaban contradiciéndose.
	 */
	const tasasSugeridas = $derived({
		discount_rate: 0,
		tax_rate: Number(data.defaultTaxRate) || 0
	});

	const resultados = $derived.by(() => {
		const t = busqueda.trim().toLowerCase();
		const lista = t
			? data.inventory.filter(
					(a) =>
						a.name.toLowerCase().includes(t) || (a.code ?? '').toLowerCase().includes(t)
				)
			: data.inventory;
		// Sin tope, el {#each} montaría 500 nodos dentro de una caja de 15rem.
		return lista.slice(0, 60);
	});

	function abrirArticulo() {
		busqueda = '';
		seleccion = null;
		alta = { quantity: 1, price: 0, ...tasasSugeridas };
		errorArticulo = null;
		agregandoArticulo = true;
	}

	function elegir(articulo) {
		seleccion = articulo;
		// El precio queda editable: esto es una cotización, no una tarifa. Las
		// tasas ya elegidas se conservan al cambiar de artículo.
		alta = { ...alta, quantity: 1, price: articulo.price };
	}

	const importeAlta = $derived(
		calculateQuoteLineAmounts({
			quantity: alta.quantity,
			price: alta.price,
			discount_rate: alta.discount_rate,
			tax_rate: alta.tax_rate
		})
	);

	const alAgregarArticulo = () => async ({ update, result }) => {
		// `reset: false` siempre; y aquí SÍ hace falta el `invalidateAll` que trae
		// `update()`, porque la fila nueva tiene que aparecer en la tabla.
		await update({ reset: false });
		if (result.type === 'failure') {
			errorArticulo = result.data?.error ?? 'No se pudo agregar el artículo.';
			return;
		}
		agregandoArticulo = false;
	};

	/* ── Diálogo: agregar paquete ──────────────────────────────────────────── */

	let agregandoPaquete = $state(false);
	let errorPaquete = $state(null);
	let paqueteElegido = $state('');

	/**
	 * Las tasas se eligen UNA vez para todo el paquete.
	 *
	 * Ponerlas por artículo dentro del diálogo sería pedirle al usuario que
	 * rellene una tabla antes de insertar nada; una vez insertadas, cada línea
	 * se corrige en la tabla como cualquier otra.
	 */
	let tasasPaquete = $state({ discount_rate: 0, tax_rate: 0 });

	const previa = $derived(
		(data.packageLines[String(paqueteElegido)] ?? []).map((l) => ({
			...l,
			importes: calculateQuoteLineAmounts({
				quantity: l.quantity,
				price: l.price,
				discount_rate: tasasPaquete.discount_rate,
				tax_rate: tasasPaquete.tax_rate
			})
		}))
	);
	const totalPrevia = $derived(previa.reduce((s, l) => s + l.importes.total, 0));
	const previaConBajas = $derived(previa.some((l) => l.is_active !== 1));

	function abrirPaquete() {
		paqueteElegido = '';
		tasasPaquete = { ...tasasSugeridas };
		errorPaquete = null;
		agregandoPaquete = true;
	}

	const alAgregarPaquete = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			errorPaquete = result.data?.error ?? 'No se pudo insertar el paquete.';
			return;
		}
		agregandoPaquete = false;
	};

	/* ── Diálogo: editar línea ─────────────────────────────────────────────── */

	let editando = $state(false);
	let errorEdicion = $state(null);
	/** La línea que se está editando, con sus cuatro cifras en estado propio. */
	let edicion = $state({ id: null, name: '', quantity: 1, price: 0, discount_rate: 0, tax_rate: 0 });

	const importeEdicion = $derived(calculateQuoteLineAmounts(edicion));

	function abrirEdicion(item) {
		// Copia, NO referencia: cancelar tiene que dejar la fila como estaba, y
		// `lineas` se rederiva de `data`.
		edicion = {
			id: item.id,
			name: item.name,
			quantity: item.quantity,
			price: item.price,
			discount_rate: item.discount_rate,
			tax_rate: item.tax_rate
		};
		errorEdicion = null;
		editando = true;
	}

	const alEditar = () => async ({ update, result }) => {
		// `reset: false` siempre; y aquí SÍ hace falta el `invalidateAll` que trae
		// `update()`, porque la fila y los totales tienen que repintarse.
		await update({ reset: false });
		if (result.type === 'failure') {
			// En estado propio y NO leído de `form`: `form` es único por página y
			// el error de otra acción aparecería dentro de este diálogo.
			errorEdicion = result.data?.error ?? 'No se pudo guardar la línea.';
			return;
		}
		editando = false;
	};

	/* ── Copiar ────────────────────────────────────────────────────────────── */

	/**
	 * Copiar es distinto de editar: sale una cotización NUEVA, en borrador y con
	 * número propio. Por eso se puede copiar una ya convertida o cancelada, que
	 * es justo el caso habitual —repetir el trabajo del año pasado— y por eso el
	 * permiso es `quotes.create`.
	 */
	let copiando = $state(false);
	let errorCopia = $state(null);
	let destino = $state({ client_id: '', event_id: '' });

	function abrirCopia() {
		destino = {
			client_id: String(quote.client_id ?? ''),
			event_id: String(quote.event_id ?? '')
		};
		errorCopia = null;
		copiando = true;
	}

	const alCopiar = () => async ({ update, result }) => {
		// Solo `failure` es un fallo. La copia responde con un REDIRECT a la
		// cotización nueva, y tratar eso como «no éxito» pintaba «No se pudo
		// copiar» encima justo mientras la navegación se estaba produciendo.
		if (result.type === 'failure') {
			await update({ reset: false });
			errorCopia = result.data?.error ?? 'No se pudo copiar la cotización.';
			return;
		}
		// `applyAction`, no `update()`: `update()` reaplica los datos de ESTA
		// página encima, así que la URL cambiaba a /quotes/4 y la pantalla seguía
		// enseñando la de la que se copió.
		copiando = false;
		await applyAction(result);
	};

	/** Los eventos se acotan al cliente destino: un evento de otro no encaja. */
	const eventosDelDestino = $derived(
		data.events.filter((evento) => String(evento.client_id) === String(destino.client_id))
	);

	$effect(() => {
		// Al cambiar de cliente, el evento heredado deja de valer.
		if (
			destino.event_id &&
			!eventosDelDestino.some((e) => String(e.id) === String(destino.event_id))
		) {
			destino.event_id = '';
		}
	});

	const otroCliente = $derived(String(destino.client_id) !== String(quote.client_id ?? ''));

	/* ── PDF ───────────────────────────────────────────────────────────────── */

	let verPdf = $state(false);
	let pdfUrl = $state('');
	let pdfNombre = $state('cotizacion.pdf');
	let generandoPdf = $state(false);

	async function abrirPdf() {
		if (generandoPdf) return;
		generandoPdf = true;
		pdfUrl = '';
		verPdf = true;
		try {
			// El servidor manda los datos Y registra `document.printed`: la
			// auditoría no puede depender de que el cliente se acuerde.
			const res = await fetch(`${page.url.pathname}/document`, { method: 'POST' });
			if (!res.ok) throw new Error('El servidor rechazó la petición.');
			const { company, quotation, items } = await res.json();

			/* Import DINÁMICO, nunca estático. Dos motivos:
			 *  - jsPDF pesa ~400 KB y no tiene por qué estar en el bundle inicial.
			 *  - Cloud es SSR: un import de nivel superior se evalúa también en el
			 *    render del servidor, y `doc.output('bloburl')` necesita `Blob` y
			 *    `URL.createObjectURL`, que allí no existen. */
			const { generateQuotationPDF } = await import('@esr/reports/quotes');
			const { url, filename } = generateQuotationPDF(quotation, items, 'preview', company);
			pdfUrl = url;
			pdfNombre = filename;
		} catch (e) {
			verPdf = false;
			errorGuardado = `No se pudo generar el documento. ${e?.message ?? ''}`.trim();
		} finally {
			generandoPdf = false;
		}
	}
</script>

<div class="record-header">
	<div class="record-titulo">
		<a class="btn-secondary btn-sm" href="/quotes">← Cotizaciones</a>
		<h1>{quote.quote_number || `#${quote.id}`}</h1>
		<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
		<!-- Sin botón de guardar, el usuario necesita saber que se guardó. -->
		<span class="estado-guardado" aria-live="polite">
			{#if errorGuardado}
				<span class="form-error">{errorGuardado}</span>
			{:else if guardando}
				Guardando…
			{:else if guardadoOk}
				Guardado
			{/if}
		</span>
	</div>

	<div class="page-actions">
		<!-- Sube aquí desde la tarjeta «Acciones», que desaparece: es una acción
		     sobre este registro, que es justo lo que vive en la cabecera, y era el
		     único enlace a la orden desde una cotización convertida. -->
		{#if data.linkedOrder}
			<a class="btn-secondary" href="/work-orders/{data.linkedOrder.id}">Ver la orden</a>
		{/if}
		{#if can('quotes.create')}
			<button type="button" class="btn-secondary" onclick={abrirCopia}>Copiar</button>
		{/if}
		<button type="button" class="btn-secondary" onclick={abrirPdf} disabled={generandoPdf}>
			{generandoPdf ? 'Generando…' : 'Imprimir'}
		</button>
	</div>
</div>

<!-- El resultado de las acciones de PAGINA —aprobar, cancelar, convertir,
     quitar linea—, que usan el `use:enhance` por defecto y por tanto escriben
     en `form`. Sin esto la respuesta era invisible: aprobar una cotizacion sin
     disponibilidad devolvia un 400 con su motivo y la pantalla no se movia.

     Los dialogos NO leen de aqui: `form` es unico por pagina y el error de una
     fila apareceria dentro del dialogo de otra cosa. Cada uno tiene su estado. -->
{#if form?.error}
	<p class="alert-error aviso-accion" role="alert">{form.error}</p>
{/if}

{#if !canEdit}
	<p class="panel-hint">
		Esta cotización está {statusLabel(quote.status).toLowerCase()}: ya no se puede editar.
		Para partir de ella, use «Copiar».
	</p>
{/if}

<div class="detail-layout">
	<div class="detail-main">
		<section class="card">
			<div class="card-header"><h2 class="card-title">Información general</h2></div>

			<div class="info-rows">
				<div class="info-row">
					<span class="info-label">Cliente</span>
					<span class="info-value">{data.customer?.name ?? '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Teléfono</span>
					<span class="info-value">{data.customer?.phone || '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Evento</span>
					<span class="info-value">{data.event?.name ?? '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Fecha</span>
					<span class="info-value">{quote.date || '—'}</span>
				</div>
				<div class="info-row">
					<span class="info-label">Válida hasta</span>
					<span class="info-value">{quote.valid_until || '—'}</span>
				</div>
				<div class="info-row">
					<label class="info-label" for="notes">Notas</label>
					<span class="info-value">
						<!-- `.form-control` explicita: en theme.css el estilo de los
						     controles cuelga de `.form-grid input/select/textarea`, y
						     este <textarea> vive en un `.info-row`. Sin la clase se
						     queda con el fondo blanco del navegador, que en el tema
						     oscuro canta. -->
						<textarea
							id="notes"
							name="notes"
							class="form-control"
							form="cabecera-cotizacion"
							rows="2"
							disabled={!mayEdit}
							bind:value={borrador.notes}
							oninput={() => programar(formularios.cabecera)}
							onblur={() => programar(formularios.cabecera, true)}
						></textarea>
					</span>
				</div>
				<div class="info-row">
					<label class="info-label" for="conditions">Condiciones</label>
					<span class="info-value">
						<textarea
							id="conditions"
							name="conditions"
							class="form-control"
							form="cabecera-cotizacion"
							rows="3"
							disabled={!mayEdit}
							bind:value={borrador.conditions}
							oninput={() => programar(formularios.cabecera)}
							onblur={() => programar(formularios.cabecera, true)}
						></textarea>
					</span>
				</div>
				<!-- Dicho donde se escribe el texto: el generador recorre `notes` y
				     `conditions` en el mismo bucle y los imprime los dos. -->
				<p class="panel-hint">Notas y condiciones aparecen impresas en la cotización.</p>
			</div>
		</section>

		<section class="card card--flush">
			<div class="card-header card-header--acolchada">
				<h2 class="card-title">Ítems cotizados</h2>
				{#if mayEdit}
					<div class="acciones-tarjeta">
						<button type="button" class="btn-primary btn-sm btn-new" onclick={abrirArticulo}>
							Agregar artículo
						</button>
						<button type="button" class="btn-secondary btn-sm btn-new" onclick={abrirPaquete}>
							Agregar paquete
						</button>
					</div>
				{/if}
			</div>

			<div class="table-container">
				<table class="data-table">
					<thead>
						<tr>
							<th>Artículo</th>
							<th>Código</th>
							<th class="num">Cant.</th>
							<th class="num">Precio</th>
							<th class="num">Desc. %</th>
							<th class="num">Imp. %</th>
							<th class="num">Importe</th>
							{#if mayEdit}<th><span class="sr-only">Acciones</span></th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each lineas as item (item.id)}
							<tr>
								<td>{item.name}</td>
								<td>{item.code || '—'}</td>
								<td class="num">{item.quantity}</td>
								<td class="num">{formatMoney(item.price)}</td>
								<td class="num">{item.discount_rate}%</td>
								<td class="num">{item.tax_rate}%</td>
								<!-- El importe va CON impuesto y ya rebajado: es lo que se cobra
								     por la linea, y su suma es el total de la derecha. -->
								<td class="num importe">{formatMoney(item.importes.total)}</td>
								{#if mayEdit}
									<td>
										<div class="row-actions">
											<button
												type="button"
												class="row-action"
												onclick={() => abrirEdicion(item)}
												aria-label="Editar {item.name}"
												title="Editar"
											>
												<Icon name="edit" />
											</button>
											<!-- «Quitar» sigue siendo un <form>: es una escritura y
											     tiene que funcionar sin JavaScript. Lo unico que
											     cambia es lo que hay dentro del <button>. -->
											<form method="POST" action={accion('removeItem')} use:enhance>
												<input type="hidden" name="itemId" value={item.id} />
												<button
													type="submit"
													class="row-action row-action--danger"
													aria-label="Quitar {item.name}"
													title="Quitar"
												>
													<Icon name="trash" />
												</button>
											</form>
										</div>
									</td>
								{/if}
							</tr>
						{:else}
							<tr>
								<!-- El <p> va DENTRO de la celda: en la misma capa
								     `.data-table td` le gana a `.empty-state` y se comería
								     su padding y su color. -->
								<td colspan={mayEdit ? 8 : 7}>
									<p class="empty-state">
										Sin líneas — agregue artículos o inserte un paquete.
									</p>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

		</section>
	</div>

	<div class="detail-side">
		<!--
			El <form> de la cabecera ya no envuelve nada visible: se quedo con las
			notas, que estan arriba en «Informacion general» y lo referencian con
			`form="cabecera-cotizacion"`. Va aqui, vacio, porque un <form> tiene que
			existir en el documento para que ese atributo lo encuentre.
		-->
		<form
			id="cabecera-cotizacion"
			method="POST"
			action={accion('updateQuote')}
			bind:this={formularios.cabecera}
			use:enhance={alGuardar(formularios.cabecera)}
		>
			<button type="submit" class="submit-oculto">Guardar notas</button>
		</form>

		<section class="card">
			<div class="card-header"><h2 class="card-title">Totales</h2></div>

			<!--
				Ni un solo campo: los cuatro numeros son SUMAS de las lineas. El
				formulario de la cabecera se quedo con las notas, que viven en
				«Informacion general» y lo referencian con `form=`.
			-->
			<div class="totals">
				<div class="total-row">
					<span>Subtotal</span>
					<span>{formatMoney(totales.subtotal)}</span>
				</div>
				<!-- Las cuatro filas se ven SIEMPRE, aunque valgan cero: «Impuesto
				     RD$0.00» dice que el impuesto se tuvo en cuenta y vale cero, que
				     no es lo mismo que no decir nada. -->
				<div class="total-row">
					<span>Descuento</span>
					<span>−{formatMoney(totales.discount)}</span>
				</div>
				<div class="total-row">
					<span>Impuesto</span>
					<span>{formatMoney(totales.tax_amount)}</span>
				</div>
				<div class="total-row total-row--final">
					<span>Total</span>
					<span>{formatMoney(totales.total)}</span>
				</div>
			</div>

			<p class="ayuda">
				Descuento e impuesto salen de las columnas «Desc. %» e «Imp. %» de cada
				ítem. Se guardan solos.
			</p>
		</section>

		<section class="card">
			<div class="card-header"><h2 class="card-title">Estado</h2></div>
			<p class="estado-actual">
				<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
			</p>

			{#if canEdit}
				<div class="acciones-columna">
					{#if quote.status !== 'aprobada' && can('quotes.approve')}
						<form method="POST" action={accion('approve')} use:enhance>
							<button type="submit" class="btn-primary w-full">Aprobar cotización</button>
						</form>
					{/if}
					{#if quote.status === 'aprobada' && can('quotes.convert')}
						<form method="POST" action={accion('convert')} use:enhance>
							<button type="submit" class="btn-success w-full">Convertir a orden</button>
						</form>
					{/if}
					{#if can('quotes.cancel')}
						<form method="POST" action={accion('cancel')} use:enhance>
							<button type="submit" class="btn-danger w-full">Cancelar cotización</button>
						</form>
					{/if}
				</div>
			{/if}
		</section>

	</div>
</div>

<!-- ── Editar línea ────────────────────────────────────────────────────── -->
<Modal bind:open={editando} size="sm" title="Editar línea">
	{#if errorEdicion}<div class="alert-error" role="alert">{errorEdicion}</div>{/if}

	<p class="panel-hint">{edicion.name}</p>

	<form
		id="editar-linea"
		method="POST"
		action={accion('updateItem')}
		class="form-grid"
		use:enhance={alEditar}
	>
		<input type="hidden" name="itemId" value={edicion.id} />
		<div class="form-field">
			<label for="edit_qty">Cantidad</label>
			<input
				id="edit_qty"
				name="quantity"
				type="number"
				min="1"
				step="1"
				required
				bind:value={edicion.quantity}
			/>
		</div>
		<div class="form-field">
			<label for="edit_price">Precio unitario</label>
			<input
				id="edit_price"
				name="price"
				type="number"
				min="0"
				step="0.01"
				required
				bind:value={edicion.price}
			/>
		</div>
		<div class="form-field">
			<label for="edit_desc">Descuento %</label>
			<!--
				`step="any"` y no `step="0.01"`: con un paso declarado, un valor que
				no sea múltiplo suyo da `stepMismatch` y el formulario NO envía, sin
				error ni aviso. Y las tasas tienen tres decimales de verdad: el
				traspaso de las cotizaciones viejas produce «6.818».
			-->
			<input
				id="edit_desc"
				name="discount_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={edicion.discount_rate}
			/>
		</div>
		<div class="form-field">
			<label for="edit_imp">Impuesto %</label>
			<input
				id="edit_imp"
				name="tax_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={edicion.tax_rate}
			/>
		</div>
		<div class="form-field full">
			<span class="form-field-label">Importe</span>
			<!-- Con impuesto y ya rebajado, igual que la columna de la tabla. -->
			<output class="alta-importe">{formatMoney(importeEdicion.total)}</output>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (editando = false)}>
			Cancelar
		</button>
		<button type="submit" form="editar-linea" class="btn-primary">Guardar línea</button>
	{/snippet}
</Modal>

<!-- ── Agregar artículo ────────────────────────────────────────────────── -->
<Modal bind:open={agregandoArticulo} size="md" title="Agregar artículo">
	{#if errorArticulo}<div class="alert-error" role="alert">{errorArticulo}</div>{/if}

	<div class="buscador">
		<input
			type="search"
			bind:value={busqueda}
			placeholder="Buscar por nombre o código"
			aria-label="Buscar en el inventario"
		/>
	</div>

	<ul class="catalog-list">
		{#each resultados as articulo (articulo.id)}
			<li>
				<button
					type="button"
					class="catalog-item"
					class:catalog-item--added={seleccion?.id === articulo.id}
					onclick={() => elegir(articulo)}
				>
					<span class="catalog-item-nombre">
						{articulo.name}
						<span class="codigo">{articulo.code || 'sin código'}</span>
					</span>
					<span class="catalog-item-meta">
						<span>Disp. {articulo.available}</span>
						<span>{formatMoney(articulo.price)}</span>
					</span>
				</button>
			</li>
		{:else}
			<li><p class="empty-state">Sin resultados para «{busqueda}».</p></li>
		{/each}
	</ul>

	{#if data.inventoryTruncado}
		<p class="ayuda">Se muestran los primeros artículos del catálogo: afine la búsqueda.</p>
	{/if}

	<form
		id="alta-articulo"
		method="POST"
		action={accion('addItem')}
		class="form-grid"
		use:enhance={alAgregarArticulo}
	>
		<input type="hidden" name="item_id" value={seleccion?.id ?? ''} />
		<div class="form-field">
			<label for="alta_qty">Cantidad</label>
			<input
				id="alta_qty"
				name="quantity"
				type="number"
				min="1"
				step="1"
				required
				bind:value={alta.quantity}
			/>
		</div>
		<div class="form-field">
			<label for="alta_price">Precio unitario</label>
			<input
				id="alta_price"
				name="price"
				type="number"
				min="0"
				step="0.01"
				required
				bind:value={alta.price}
			/>
		</div>
		<div class="form-field">
			<label for="alta_desc">Descuento %</label>
			<input
				id="alta_desc"
				name="discount_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={alta.discount_rate}
			/>
		</div>
		<div class="form-field">
			<label for="alta_imp">Impuesto %</label>
			<input
				id="alta_imp"
				name="tax_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={alta.tax_rate}
			/>
		</div>
		<div class="form-field">
			<span class="form-field-label">Importe</span>
			<!-- Con impuesto y ya rebajado, igual que la columna de la tabla: si
			     aquí se enseñara el bruto, el número cambiaría al insertar. -->
			<output class="alta-importe">{formatMoney(importeAlta.total)}</output>
		</div>
	</form>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (agregandoArticulo = false)}>
			Cancelar
		</button>
		<button type="submit" form="alta-articulo" class="btn-primary" disabled={!seleccion}>
			Agregar
		</button>
	{/snippet}
</Modal>

<!-- ── Agregar paquete ─────────────────────────────────────────────────── -->
<Modal bind:open={agregandoPaquete} size="md" title="Agregar paquete">
	{#if errorPaquete}<div class="alert-error" role="alert">{errorPaquete}</div>{/if}

	<form
		id="alta-paquete"
		method="POST"
		action={accion('addPackage')}
		class="form-grid"
		use:enhance={alAgregarPaquete}
	>
		<div class="form-field full">
			<label for="pkg">Paquete</label>
			<select id="pkg" name="package_id" required bind:value={paqueteElegido}>
				<option value="">Elija el paquete</option>
				{#each data.packages as pkg (pkg.id)}
					<option value={pkg.id}>{pkg.name} ({pkg.item_count} artículo(s))</option>
				{/each}
			</select>
		</div>
		<div class="form-field">
			<label for="pkg_desc">Descuento %</label>
			<input
				id="pkg_desc"
				name="discount_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={tasasPaquete.discount_rate}
			/>
		</div>
		<div class="form-field">
			<label for="pkg_imp">Impuesto %</label>
			<input
				id="pkg_imp"
				name="tax_rate"
				type="number"
				min="0"
				max="100"
				step="any"
				bind:value={tasasPaquete.tax_rate}
			/>
		</div>
	</form>

	{#if previa.length}
		<p class="panel-hint">
			Se insertarán {previa.length} línea(s) sueltas con el precio vigente de cada artículo.
			Después se editan como cualquier otra.
		</p>

		<div class="table-container previa">
			<table class="data-table">
				<thead>
					<tr>
						<th>Artículo</th>
						<th class="num">Cant.</th>
						<th class="num">Precio</th>
						<th class="num">Importe</th>
					</tr>
				</thead>
				<tbody>
					{#each previa as linea (linea.item_id)}
						<tr>
							<td>
								{linea.name}
								<span class="codigo">{linea.code || '—'}</span>
								{#if linea.is_active !== 1}
									<span class="badge badge-danger">Dado de baja</span>
								{/if}
							</td>
							<td class="num">{linea.quantity}</td>
							<td class="num">{formatMoney(linea.price)}</td>
							<!-- Con las tasas del diálogo ya aplicadas: es lo que va a
							     añadir al total, no el bruto. -->
							<td class="num">{formatMoney(linea.importes.total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="total-row total-row--final">
			<span>Añade al subtotal</span>
			<span>{formatMoney(totalPrevia)}</span>
		</div>

		{#if previaConBajas}
			<p class="alert-error" role="alert">
				Este paquete tiene artículos dados de baja. Insertarlo fallaría a mitad y dejaría
				la cotización con las líneas anteriores ya metidas: revise el paquete primero.
			</p>
		{/if}
	{:else if paqueteElegido}
		<p class="empty-state">Ese paquete está vacío: no hay nada que insertar.</p>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (agregandoPaquete = false)}>
			Cancelar
		</button>
		<button
			type="submit"
			form="alta-paquete"
			class="btn-primary"
			disabled={!previa.length || previaConBajas}
		>
			Insertar {previa.length || ''} línea(s)
		</button>
	{/snippet}
</Modal>

<!-- ── Copiar ──────────────────────────────────────────────────────────── -->
<Modal bind:open={copiando} size="sm" title="Copiar cotización">
	{#if errorCopia}<div class="alert-error" role="alert">{errorCopia}</div>{/if}

	<p class="panel-hint">
		Se copian los artículos con sus fechas, el descuento, el impuesto, las notas y las
		condiciones. La copia nace en <strong>borrador</strong>, con número nuevo y fecha de hoy.
	</p>

	<form
		id="copiar-cotizacion"
		method="POST"
		action={accion('copy')}
		class="form-grid"
		use:enhance={alCopiar}
	>
		<div class="form-field full">
			<label for="copia_client">Cliente *</label>
			<select id="copia_client" name="client_id" required bind:value={destino.client_id}>
				<option value="">Elija el cliente</option>
				{#each data.customers as customer (customer.id)}
					<option value={customer.id}>{customer.name}</option>
				{/each}
			</select>
		</div>
		<div class="form-field full">
			<label for="copia_event">Evento</label>
			<select id="copia_event" name="event_id" bind:value={destino.event_id}>
				<option value="">Sin evento</option>
				{#each eventosDelDestino as evento (evento.id)}
					<option value={evento.id}>{evento.name} — {evento.date}</option>
				{/each}
			</select>
			{#if destino.client_id && eventosDelDestino.length === 0}
				<p class="ayuda">Ese cliente no tiene eventos: la copia quedará sin evento.</p>
			{/if}
		</div>
	</form>

	{#if otroCliente}
		<p class="panel-hint">
			Va a otro cliente. Se copian los precios acordados con el original: revíselos si su
			tarifa es distinta.
		</p>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={() => (copiando = false)}>
			Cancelar
		</button>
		<button type="submit" form="copiar-cotizacion" class="btn-primary">Copiar</button>
	{/snippet}
</Modal>

<PdfPreviewModal
	bind:show={verPdf}
	{pdfUrl}
	filename={pdfNombre}
	title="Vista previa de cotización"
/>

<style>
	/* `.alert-error` de theme.css no trae separacion vertical —es un componente
	   que se usa dentro de formularios, donde el `gap` del contenedor la pone—.
	   Aqui va suelto entre la cabecera y la ficha. */
	.aviso-accion {
		margin: 0 0 var(--sp-4);
	}
	/* Cabecera propia y no `.page-header`: esa clase lleva un
	   `> :first-child:last-child { margin-left: auto }` para los listados. */
	.record-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.record-titulo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		min-width: 0;
	}

	.record-titulo h1 {
		margin: 0;
		font-size: 1.6rem;
	}

	.estado-guardado {
		font-size: var(--font-xs);
		color: var(--text-secondary);
		min-width: 6rem;
	}

	.btn-sm {
		padding: var(--sp-1) var(--sp-3);
		font-size: var(--font-xs);
	}

	/* La tarjeta de líneas deja que la tabla llegue a los bordes; el padding
	   vuelve a su cabecera. */
	.card--flush {
		padding: 0;
	}

	.card-header--acolchada {
		padding: var(--sp-4) var(--sp-5);
		margin-bottom: 0;
	}

	.acciones-tarjeta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.acciones-columna {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.w-full {
		width: 100%;
		text-align: center;
	}

	.estado-actual {
		margin: 0 0 var(--sp-3);
	}

	.num {
		text-align: right;
	}

	.importe {
		font-weight: 600;
		white-space: nowrap;
	}

	/* Visible solo para quien navega sin JavaScript o con teclado, igual que
	   `.filters-submit`: con JavaScript el usuario nunca lo ve, y sin él la
	   pantalla sigue siendo usable. */
	.submit-oculto {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.submit-oculto:focus-visible {
		position: static;
		width: auto;
		height: auto;
		margin: 0;
		clip-path: none;
		padding: var(--sp-2) var(--sp-4);
		border: 1px solid var(--border-focus);
		border-radius: var(--border-radius-sm);
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: var(--font-sm);
	}

	.buscador {
		margin-bottom: var(--sp-3);
	}

	.buscador input {
		width: 100%;
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
		color: var(--text-primary);
		font-family: inherit;
		font-size: var(--font-sm);
		outline: none;
	}

	.buscador input:focus {
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.catalog-item-nombre {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.codigo {
		margin-left: var(--sp-2);
		font-size: var(--font-xs);
		/* --text-secondary y no --text-muted: sobre el fondo hundido de la lista
		   el muted cae por debajo de AA. */
		color: var(--text-secondary);
	}

	.alta-importe {
		display: block;
		padding: var(--sp-2) 0;
		font-weight: 600;
	}

	.previa {
		max-height: 14rem;
		overflow-y: auto;
		margin-bottom: var(--sp-3);
	}

	.ayuda {
		margin: var(--sp-2) 0 0;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
