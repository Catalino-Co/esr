<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import StatusSelect from './StatusSelect.svelte';

	/**
	 * Barra de filtros única de los listados.
	 *
	 * Es UNA fila horizontal, no tres controles apilados: el buscador crece y
	 * los selects tienen base fija. El `.filter-bar` anterior daba `width: 100%`
	 * a cada control sin `flex-basis`, así que todos pedían el ancho entero y
	 * luego encogían según su contenido — de ahí el aspecto irregular.
	 *
	 * No hay botón de buscar: filtra en vivo con debounce.
	 *
	 * @typedef {{ name: string, label: string, value: string,
	 *             options: Array<{value: string|number, label: string, tone?: string}>,
	 *             width?: string }} FilterSelect
	 */
	let {
		/** Configuración del buscador. `null` si la pantalla no busca. */
		search = null,
		/** @type {FilterSelect[]} */
		selects = [],
		/** Campos de fecha: { name, label, value } */
		dates = [],
		/**
		 * Accion primaria de la pantalla, al final de la MISMA fila. Antes
		 * colgaba de un `.page-header` propio encima, que gastaba una fila
		 * entera para un solo boton.
		 */
		actions = null,
		delay = 300
	} = $props();

	let timer = null;

	/**
	 * Reescribe los parámetros y navega. `keepFocus` es imprescindible: sin él
	 * el cursor sale del input en cada tecla y escribir se vuelve imposible.
	 * `replaceState` evita llenar el historial con una entrada por pulsación.
	 */
	function apply(changes, immediate = false) {
		const url = new URL(page.url);
		for (const [key, value] of Object.entries(changes)) {
			if (value === '' || value === null || value === undefined) url.searchParams.delete(key);
			else url.searchParams.set(key, String(value));
		}

		const navigate = () =>
			goto(url, { keepFocus: true, replaceState: true, noScroll: true, invalidateAll: true });

		clearTimeout(timer);
		if (immediate) navigate();
		else timer = setTimeout(navigate, delay);
	}

	// Escribir espera; elegir en un select es una decisión cerrada y va directa.
	const onSearchInput = (event) => apply({ [search.name]: event.currentTarget.value });
	const onSelectChange = (name) => (event) => apply({ [name]: event.currentTarget.value }, true);
</script>

<!-- El <form> envolvente mantiene el filtrado sin JavaScript: sin él, una
     página sin hidratar se quedaría sin ninguna forma de filtrar. -->
<form class="filters" method="GET" data-sveltekit-keepfocus data-sveltekit-replacestate>
	{#if search}
		<div class="filters-search">
			<span class="filters-search-icon" aria-hidden="true">
				<svg viewBox="0 0 16 16" width="15" height="15">
					<circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
					<path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
				</svg>
			</span>
			<input
				type="search"
				name={search.name}
				placeholder={search.placeholder}
				value={search.value}
				aria-label={search.placeholder}
				oninput={onSearchInput}
			/>
		</div>
	{/if}

	{#each selects as select (select.name)}
		<div class="filters-control" style={select.width ? `flex-basis:${select.width}` : undefined}>
			<StatusSelect
				name={select.name}
				value={select.value}
				options={select.options}
				label={select.label}
				onchange={onSelectChange(select.name)}
			/>
		</div>
	{/each}

	{#each dates as field (field.name)}
		<div class="filters-control filters-control--date">
			<input
				type="date"
				name={field.name}
				value={field.value}
				aria-label={field.label}
				title={field.label}
				onchange={onSelectChange(field.name)}
			/>
		</div>
	{/each}

	<!-- Sin JavaScript esto es lo único que envía el formulario. -->
	<button type="submit" class="filters-submit">Filtrar</button>

	{#if actions}
		<div class="filters-actions">{@render actions()}</div>
	{/if}
</form>

<style>
	/* `.filters*` y `.status-select` viven en @esr/config/theme.css: Cloud y
	   Desktop comparten la barra de filtros. Este componente ya no declara
	   estilos propios; una regla local aqui iria sin capa y dejaria inerte la
	   version compartida. */
</style>
