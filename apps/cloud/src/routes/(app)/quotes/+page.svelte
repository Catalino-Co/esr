<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import { quoteStatusFilterOptions, statusBadgeClass, statusLabel } from '@esr/core';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	/* La lista sale de `@esr/core` y ya no se escribe aquí: escrita a mano en
	   cada pantalla, Cloud y ESR Pro habían acabado ofreciendo conjuntos
	   distintos. `QUOTE_STATUS_ALL` es el centinela de «todas», que no puede ser
	   la cadena vacía porque `irCon` la borraría de la URL y el `load` volvería
	   a poner el valor por defecto. */
	const ESTADOS = quoteStatusFilterOptions();

	/**
	 * Navega conservando el resto de la query.
	 *
	 * El select ya no vive dentro de `FilterBar`, así que se queda sin su
	 * `<form method="GET">` y hay que navegar a mano. Mismo helper que usan
	 * Inventario y Movimientos.
	 */
	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	/* ── El alta, en un diálogo con URL propia ─────────────────────────────
	 *
	 * `?nueva=1` y no una variable suelta: así el diálogo sobrevive a un
	 * refresco, se puede enlazar —desde el Dashboard y desde la ficha del
	 * evento— y el botón «atrás» del navegador lo cierra en vez de abandonar la
	 * pantalla.
	 *
	 * NO se usa `irCon()`: aquel navega con `replaceState: true`, y con eso
	 * «atrás» se saltaría el diálogo entero.
	 *
	 * Y sin `invalidateAll`: el `load` solo declara `search` y `status`, así que
	 * tocar `nueva` no dispara ni una consulta. Abrir esto cuesta cero.
	 */
	const abierto = $derived(page.url.searchParams.get('nueva') === '1');

	/** @param {string | null} valor */
	function nueva(valor) {
		const url = new URL(page.url);
		if (valor === null) url.searchParams.delete('nueva');
		else url.searchParams.set('nueva', valor);
		goto(url, { noScroll: true, keepFocus: true });
	}

	/**
	 * Lo tecleado en el diálogo.
	 *
	 * Al fallar, el servidor devuelve `values` y de ahí se repuebla: un error no
	 * puede borrar lo escrito. En éxito no hay nada que hacer —la action
	 * redirige a la ficha y el diálogo se va con la página—.
	 */
	let borrador = $state(/** @type {Record<string, string>} */ ({}));
	/**
	 * Error del alta, en estado PROPIO y no leído de `form`.
	 *
	 * `form` es único por página: `approveMany` y `cancelMany` escriben en el
	 * mismo objeto, así que mirarlo aquí haría que el parte de un lote se
	 * pintase dentro del diálogo.
	 */
	let errorCrear = $state(/** @type {string | null} */ (null));

	/**
	 * El evento que llega por `?eventId=`, desde la ficha del evento.
	 *
	 * Se resuelve en cliente sobre `data.events` —que ya viene cargada y con la
	 * fila entera, `client_id` incluido—, en vez del `findById` que hacía el
	 * `load` de la pantalla vieja.
	 *
	 * Si el evento no está entre los cargados no se preselecciona nada. Tampoco
	 * podría elegirse en el select, que se puebla de esa misma lista.
	 */
	const eventoPrevio = $derived.by(() => {
		const id = page.url.searchParams.get('eventId')?.trim();
		if (!id) return null;
		return data.events.find((e) => String(e.id) === id) ?? null;
	});

	const eventoElegido = $derived(borrador.event_id ?? (eventoPrevio ? String(eventoPrevio.id) : ''));
	const clienteElegido = $derived(
		borrador.client_id ?? (eventoPrevio?.client_id ? String(eventoPrevio.client_id) : '')
	);

	function abrirAlta() {
		borrador = {};
		errorCrear = null;
		nueva('1');
	}

	function cerrarAlta() {
		errorCrear = null;
		// Solo si sigue abierto: `onclose` también se dispara cuando el diálogo se
		// desmonta por la redirección, y ahí no hay nada que cerrar.
		if (abierto) nueva(null);
	}

	const alCrear = () => async (/** @type {{ update: Function, result: any }} */ { update, result }) => {
		await update({ reset: false });
		if (result.type === 'failure') {
			if (result.data?.values) borrador = result.data.values;
			errorCrear = result.data?.error ?? 'No se pudo crear la cotización.';
		}
	};

	let recargando = $state(false);

	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	/* ── Selección múltiple ────────────────────────────────────────────────
	 *
	 * Apagada por defecto: la lista se lee mucho más de lo que se opera en
	 * bloque, y una columna de casillas siempre visible estorba al leer.
	 *
	 * El `Set` se reasigna con una COPIA en cada cambio y no se muta. Un `Set`
	 * nativo dentro de `$state` no avisa de sus propias mutaciones, así que un
	 * `.add()` marcaría la casilla en el DOM y dejaría el recuento congelado.
	 * Es el mismo patrón que la pantalla de emitir factura.
	 */
	let modo = $state(false);
	let elegidas = $state(new Set());

	function alternarModo() {
		modo = !modo;
		// Al salir del modo se vacía: si no, quedarían marcas invisibles que la
		// próxima vez que se encienda aparecerían de la nada.
		if (!modo) elegidas = new Set();
	}

	/** @param {unknown} id */
	function alternar(id) {
		const copia = new Set(elegidas);
		const clave = String(id);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		elegidas = copia;
	}

	function alternarTodas() {
		elegidas = todas ? new Set() : new Set(data.quotes.map((q) => String(q.id)));
	}

	const total = $derived(data.quotes.length);
	const todas = $derived(total > 0 && elegidas.size === total);
	/* Ni ninguna ni todas: la casilla de cabecera va en un tercer estado que el
	   HTML solo expone por propiedad, nunca por atributo. */
	const algunas = $derived(elegidas.size > 0 && !todas);

	/**
	 * Lo que cada acción puede hacer DE VERDAD con lo seleccionado.
	 *
	 * Los botones lo dicen —«Aprobar (3)»— en vez de deshabilitar las casillas de
	 * las filas que no aplican: una casilla apagada sin explicación deja al
	 * usuario adivinando, y el número enseña la regla sin estorbar.
	 */
	const seleccionadas = $derived(data.quotes.filter((q) => elegidas.has(String(q.id))));
	/* Aprobar se salta además las que YA están aprobadas: el servidor no las
	   toca —reaprobar no cambia la fila pero dejaría una entrada de auditoría de
	   algo que no pasó— y el botón tiene que contar lo mismo que hará. */
	const aprobables = $derived(
		seleccionadas.filter(
			(q) => q.status !== 'cancelada' && q.status !== 'convertida' && q.status !== 'aprobada'
		).length
	);
	const cancelables = $derived(
		seleccionadas.filter((q) => q.status !== 'cancelada' && q.status !== 'convertida').length
	);

	/** Tras un lote, la selección deja de tener sentido: la tabla ya es otra. */
	const alEnviar = () => async (/** @type {{ update: Function }} */ { update }) => {
		await update({ reset: false });
		elegidas = new Set();
	};
</script>

<!--
	Las herramientas van FUERA de la tarjeta y el contenido dentro. Antes el
	interruptor compartía fila con el buscador y el select, y esa fila hacía tres
	trabajos distintos a la vez: navegar, filtrar y operar.
-->
<div class="herramientas">
	<!-- Los tres pegados en un grupo: son de la misma familia —qué hago con esta
	     pantalla— frente a los de la derecha, que son sobre los datos. -->
	<div class="grupo">
		<a
			class="grupo-btn"
			href="/dashboard"
			aria-label="Volver al dashboard"
			title="Volver al dashboard"
		>
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar la lista"
			title="Recargar la lista"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
		<!--
			Un glifo NO es un nombre accesible: el nombre va en `aria-label` y el
			`title` lo enseña al apuntar. `aria-pressed` es lo que dice que esto
			ENCIENDE Y APAGA algo en vez de ejecutar una acción.
		-->
		<button
			type="button"
			class="grupo-btn"
			class:encendido={modo}
			aria-pressed={modo}
			aria-label={modo ? 'Salir del modo selección' : 'Seleccionar varias cotizaciones'}
			title={modo ? 'Salir del modo selección' : 'Seleccionar varias cotizaciones'}
			onclick={alternarModo}
		>
			<Icon name="listChecks" size={18} />
		</button>
	</div>

	<div class="herramientas-datos">
		<StatusSelect
			name="status"
			value={data.status}
			options={ESTADOS}
			label="Estado de la cotización"
			onchange={(/** @type {Event & { currentTarget: HTMLSelectElement }} */ e) =>
				irCon({ status: e.currentTarget.value })}
		/>
		{#if can('quotes.create')}
			<button type="button" class="btn-primary btn-new" onclick={abrirAlta}>
				Nueva cotización
			</button>
		{/if}
	</div>
</div>

<section class="panel">
	<!-- Solo el buscador: sin selects al lado, su `flex: 1 1 auto` le da la fila
	     entera. Se queda dentro de `FilterBar` para conservar el retardo al
	     teclear y el filtrado sin JavaScript. -->
	<FilterBar
		search={{ name: 'search', placeholder: 'Número, cliente o evento', value: data.search }}
	/>

	<!-- Callado mientras el diálogo está abierto: su error se pinta DENTRO, y
	     detrás no debe quedar el mismo texto repetido. -->
	{#if form?.error && !abierto}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<!-- El parte del lote. Se separa lo que salió de lo que no, y lo que no sale
	     CON SU MOTIVO y por número: «se saltaron 2» sin decir cuáles obliga a
	     revisar la tabla entera a ojo. -->
	{#if form?.bulk}
		{@const parte = form.bulk}
		<div class="alert-{parte.saltadas.length ? 'warning' : 'success'}" role="status">
			<p class="parte-titulo">
				{#if parte.hechas === 1}
					1 cotización {parte.accion === 'aprobar' ? 'aprobada' : 'cancelada'}.
				{:else}
					{parte.hechas} cotizaciones {parte.accion === 'aprobar' ? 'aprobadas' : 'canceladas'}.
				{/if}
			</p>
			{#if parte.saltadas.length}
				<p>Se quedaron fuera:</p>
				<ul>
					{#each parte.saltadas as motivo (motivo)}<li>{motivo}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if data.quotes.length === 0}
		<p class="empty-state">No hay cotizaciones.</p>
	{:else}
		<!-- El <form> envuelve la tabla para que las casillas se serialicen solas:
		     un `name="ids"` repetido llega al servidor como `getAll('ids')`, sin
		     tener que construir el cuerpo a mano. -->
		<form method="POST" use:enhance={alEnviar}>
			{#if modo}
				<div class="barra-seleccion">
					<span class="cuenta">
						{elegidas.size}
						{elegidas.size === 1 ? 'seleccionada' : 'seleccionadas'}
						<!-- El listado trae 100 como mucho: «todas» son las de la
						     pantalla, no las que existan. Decirlo evita creer que un
						     lote alcanzó a las que ni se ven. -->
						<span class="matiz">de las {total} en pantalla</span>
					</span>
					<div class="acciones">
						{#if can('quotes.approve')}
							<button
								type="submit"
								formaction="?/approveMany"
								class="btn-success"
								disabled={aprobables === 0}
							>
								<Icon name="check" size={16} />
								Aprobar ({aprobables})
							</button>
						{/if}
						{#if can('quotes.cancel')}
							<!-- En rojo: es la que retira cotizaciones, y tiene que
							     distinguirse de un vistazo de la que las aprueba. -->
							<button
								type="submit"
								formaction="?/cancelMany"
								class="btn-danger"
								disabled={cancelables === 0}
							>
								<Icon name="x" size={16} />
								Cancelar ({cancelables})
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<table class="data-table data-table--acento">
				<thead>
					<tr>
						{#if modo}
							<th class="check">
								<input
									type="checkbox"
									checked={todas}
									indeterminate={algunas}
									onchange={alternarTodas}
									aria-label="Seleccionar todas las de la pantalla"
								/>
							</th>
						{/if}
						<th>Número</th>
						<th>Cliente</th>
						<th>Evento</th>
						<th>Estado</th>
						<th>Total</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.quotes as quote (quote.id)}
						<tr>
							{#if modo}
								<td class="check">
									<input
										type="checkbox"
										name="ids"
										value={quote.id}
										checked={elegidas.has(String(quote.id))}
										onchange={() => alternar(quote.id)}
										aria-label="Seleccionar {quote.quote_number || `#${quote.id}`}"
									/>
								</td>
							{/if}
							<td>{quote.quote_number || `#${quote.id}`}</td>
							<td>{quote.client_name}</td>
							<td>{quote.event_name}</td>
							<!-- Badge, no el enum crudo. Esta era la única lista de Cloud que
							     pintaba `{quote.status}` tal cual, teniendo los dos ayudantes
							     de `@esr/core` a mano en la ficha hermana. -->
							<td>
								<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
							</td>
							<td>{Number(quote.total || 0).toFixed(2)}</td>
							<td><a class="btn-view" href="/quotes/{quote.id}">Ver</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</form>
	{/if}
</section>

<!-- ── Alta de cotización ──────────────────────────────────────────────────
	Solo la cabecera: evento, cliente, vigencia y los dos textos que salen en el
	PDF. Las líneas se cargan en la ficha, que es donde está el catálogo y la
	comprobación de disponibilidad.

	Quien manda es la URL, no una variable, así que el diálogo va MONTADO bajo un
	`{#if}` en vez de con `bind:open`: no se puede enlazar un `$derived`, y
	dejarle a `Modal` su propio `open` sin atar dejaría los dos estados
	discrepando. Montándolo así, cada apertura nace limpia y el cierre pasa
	siempre por `onclose`, que cubre las tres vías (✕, backdrop y Escape).
-->
{#if abierto}
<Modal open title="Nueva cotización" onclose={cerrarAlta}>
	{#if errorCrear}
		<div class="alert-error" role="alert">{errorCrear}</div>
	{/if}

	<form id="alta-cotizacion" method="POST" action="?/create" class="form-grid" use:enhance={alCrear}>
		<div class="form-field">
			<label for="alta-evento">Evento *</label>
			<select id="alta-evento" name="event_id" required>
				<option value="">Seleccione evento</option>
				{#each data.events as evento (evento.id)}
					<option value={evento.id} selected={eventoElegido === String(evento.id)}>
						{evento.name} ({evento.date || 'sin fecha'})
					</option>
				{/each}
			</select>
		</div>

		<div class="form-field">
			<label for="alta-cliente">Cliente *</label>
			<select id="alta-cliente" name="client_id" required>
				<option value="">Seleccione cliente</option>
				{#each data.customers as cliente (cliente.id)}
					<option value={cliente.id} selected={clienteElegido === String(cliente.id)}>
						{cliente.name}
					</option>
				{/each}
			</select>
		</div>

		<div class="form-field">
			<label for="alta-vigencia">Válida hasta</label>
			<input
				id="alta-vigencia"
				name="valid_until"
				type="date"
				value={borrador.valid_until ?? ''}
			/>
		</div>

		<div class="form-field full">
			<label for="alta-notas">Notas</label>
			<textarea id="alta-notas" name="notes" rows="2">{borrador.notes ?? ''}</textarea>
		</div>

		<div class="form-field full">
			<label for="alta-condiciones">Condiciones</label>
			<textarea id="alta-condiciones" name="conditions" rows="3">{borrador.conditions ?? ''}</textarea>
		</div>
	</form>

	<!--
		Dicho una vez, para los dos campos, y dicho de verdad: el generador recorre
		`notes` y `conditions` en el MISMO bucle y los imprime los dos, bajo
		«Notas:» y «Condiciones:». En ESR Pro esto se llamaba «Observaciones
		internas», que invitaba a escribir justo lo que el cliente no debe ver.
	-->
	<p class="panel-hint">Las dos aparecen impresas en la cotización que ve el cliente.</p>

	{#snippet footer()}
		<button type="button" class="btn-secondary" onclick={cerrarAlta}>Cancelar</button>
		<button type="submit" form="alta-cotizacion" class="btn-primary">Crear cotización</button>
	{/snippet}
</Modal>
{/if}

<style>
	/* La fila de herramientas, el grupo de botones y la cabecera en acento se
	   promovieron a theme.css: los usa tambien la lista de cotizaciones de ESR
	   Pro. Aqui abajo queda solo lo que es de ESTA pantalla.

	   No basta con no repetirlos: mientras la copia local siguiera aqui ganaria
	   ella, porque un <style> de componente va sin capa y lo no-capado gana a
	   theme.css sin importar la especificidad. */

	.check {
		width: 2.5rem;
	}

	/* ── La barra de selección ──────────────────────────────────────────── */

	.barra-seleccion {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-2) var(--sp-3);
		margin-bottom: var(--sp-3);
		background: var(--surface-sunken);
		border-radius: var(--border-radius-sm);
	}

	/* Sobre fondo hundido el texto sube a `--text-secondary`: la regla 7 dice
	   que `--text-muted` ahí se queda en 4,34:1 y no llega a AA. */
	.cuenta {
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.matiz {
		font-weight: 400;
		color: var(--text-secondary);
	}

	.acciones {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.parte-titulo {
		margin: 0;
		font-weight: 600;
	}

	.alert-warning ul,
	.alert-success ul {
		margin: var(--sp-1) 0 0;
		padding-left: var(--sp-4);
	}
</style>
