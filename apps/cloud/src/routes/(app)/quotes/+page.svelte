<script>
	import { enhance } from '$app/forms';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	import StatusSelect from '$lib/components/list/StatusSelect.svelte';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const ESTADOS = [
		{ value: '', label: 'Cualquier estado' },
		{ value: 'borrador', label: 'Borrador' },
		{ value: 'aprobada', label: 'Aprobada' },
		{ value: 'cancelada', label: 'Cancelada' },
		{ value: 'convertida', label: 'Convertida' }
	];

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
			<a class="btn-primary btn-new" href="/quotes/new">Nueva cotización</a>
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

	{#if form?.error}
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

			<table class="data-table">
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
							<td>{quote.status}</td>
							<td>{Number(quote.total || 0).toFixed(2)}</td>
							<td><a class="btn-view" href="/quotes/{quote.id}">Ver</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</form>
	{/if}
</section>

<style>
	/* ── La fila de herramientas ────────────────────────────────────────── */

	.herramientas {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.herramientas-datos {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-2);
	}

	/*
		Grupo de botones: pegados, con el borde y el radio en el CONTENEDOR.

		Los hijos van sin borde propio y se separan con un `border-right` que se
		quita en el último. La alternativa —cada botón con su borde y
		`margin-left: -1px`— deja bordes dobles a medio pintar en cuanto uno
		cambia de color, que es justo lo que pasa aquí con el encendido.

		Sin `overflow: hidden`, que recortaría el anillo de foco del botón del
		medio: el radio se pone a mano en el primero y el último.
	*/
	.grupo {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--surface);
	}

	.grupo-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		flex-shrink: 0;
		border: none;
		border-right: 1px solid var(--border);
		border-radius: 0;
		background: none;
		/* `color` explícito: el `a { color: inherit }` que el `app.css` trae sin
		   capa dejaría el icono del enlace en el color del texto del cuerpo. */
		color: var(--text-secondary);
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast);
	}

	.grupo-btn:first-child {
		border-top-left-radius: calc(var(--border-radius-sm) - 1px);
		border-bottom-left-radius: calc(var(--border-radius-sm) - 1px);
	}

	.grupo-btn:last-child {
		border-right: none;
		border-top-right-radius: calc(var(--border-radius-sm) - 1px);
		border-bottom-right-radius: calc(var(--border-radius-sm) - 1px);
	}

	.grupo-btn:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.grupo-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* El anillo por encima de los vecinos, o el borde del de al lado lo corta. */
	.grupo-btn:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
		position: relative;
		z-index: 1;
	}

	/*
		El interruptor encendido.

		Relleno de acento y letra blanca: sin texto, un cambio de borde no se ve.
		Aquí sí va el acento sólido y no el par suave de los badges, porque es el
		estado de un modo que cambia la tabla entera y tiene que cantar.
	*/
	.grupo-btn.encendido {
		background: var(--accent);
		color: var(--text-on-accent);
	}

	.grupo-btn.encendido:hover:not(:disabled) {
		background: var(--accent-hover);
		color: var(--text-on-accent);
	}

	/* El icono de recargar gira mientras se recarga. Un `span` intermedio y no
	   el propio botón: girar el botón giraría también su anillo de foco. */
	.girando {
		display: inline-flex;
		animation: girar 0.9s linear infinite;
	}

	@keyframes girar {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.girando {
			animation: none;
		}
	}

	/* ── La tabla ───────────────────────────────────────────────────────── */

	/*
		EXCEPCIÓN DELIBERADA, y solo de esta pantalla.

		El sistema dice dos cosas que esto rompe: la regla 1 —«`--accent` sólido
		solo en el botón primario»— y el patrón de tabla —«`thead` sin fondo
		gris»—. Se hace porque se pidió así, a sabiendas, y queda acotado a este
		archivo: no es el patrón, y copiarlo a otra tabla sería extender la
		excepción.

		Medido antes de escribirlo: blanco sobre el acento da 6,29:1 en claro y
		4,75:1 en oscuro, y los dos pasan AA para texto normal, que es lo que es
		un `th` de 12 px. `--text-on-accent` es blanco fijo y no cambia con el
		tema; `--text-muted`, que es lo que la hoja compartida le pone, sería
		ilegible sobre este fondo.
	*/
	.data-table th {
		background: var(--accent);
		color: var(--text-on-accent);
		border-bottom-color: var(--accent);
	}

	.data-table th:first-child {
		border-top-left-radius: var(--border-radius-sm);
	}

	.data-table th:last-child {
		border-top-right-radius: var(--border-radius-sm);
	}

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
