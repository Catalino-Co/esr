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
	.status-select {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-surface);
		transition:
			border-color var(--transition-fast),
			box-shadow var(--transition-fast);
	}

	.status-select:hover {
		border-color: var(--border-light);
	}

	/* El foco vive en el label, no en el select, porque el select es
	   transparente y su anillo quedaría por dentro del borde. */
	.status-select:focus-within {
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	select {
		appearance: none;
		-webkit-appearance: none;
		border: none;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--font-sm);
		/* Sitio para el chevron, que va superpuesto. */
		padding: var(--sp-2) var(--sp-5) var(--sp-2) 0;
		width: 100%;
		cursor: pointer;
		outline: none;
	}

	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot--ok {
		background: var(--brand-success);
	}
	.dot--warn {
		background: var(--brand-warning);
	}
	.dot--off {
		background: var(--text-muted);
	}

	.chevron {
		position: absolute;
		right: var(--sp-3);
		display: flex;
		color: var(--text-muted);
		pointer-events: none;
	}
</style>
