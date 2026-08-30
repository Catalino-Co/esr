<script>
	/**
	 * Select con punto de color y chevron propio.
	 *
	 * Un `<select>` nativo con `appearance: none` en vez de un menú a medida:
	 * conserva el teclado, el lector de pantalla y el desplegable del sistema
	 * operativo, que en móvil es mucho mejor que cualquier imitación.
	 */
	let {
		name,
		value = '',
		/** { value, label, tone? } — tone pinta el punto: ok | warn | off | none */
		options = [],
		label = '',
		onchange = () => {}
	} = $props();

	const selected = $derived(options.find((option) => String(option.value) === String(value)));
	const tone = $derived(selected?.tone ?? 'none');
</script>

<label class="status-select" aria-label={label || undefined}>
	{#if tone !== 'none'}
		<span class="dot dot--{tone}" aria-hidden="true"></span>
	{/if}

	<!-- Los `value` van forzados a cadena: Svelte empareja el valor del select
	     con el de la opcion por identidad, y un 1 numerico no coincide con el
	     "1" que llega de la URL, asi que no se marcaba ninguna. -->
	<select {name} value={String(value)} {onchange}>
		{#each options as option (option.value)}
			<option value={String(option.value)}>{option.label}</option>
		{/each}
	</select>

	<span class="chevron" aria-hidden="true">
		<svg viewBox="0 0 12 12" width="12" height="12">
			<path
				d="M2.5 4.5 6 8l3.5-3.5"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</span>
</label>

<style>
	/* `.filters*` y `.status-select` viven en @esr/config/theme.css: Cloud y
	   Desktop comparten la barra de filtros. Este componente ya no declara
	   estilos propios; una regla local aqui iria sin capa y dejaria inerte la
	   version compartida. */
</style>
