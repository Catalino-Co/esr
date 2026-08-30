<script>
	/**
	 * Estado vacío con las cuatro piezas que pide el sistema de diseño: icono de
	 * trazo, título, una línea de explicación y el botón que lo resuelve.
	 *
	 * El icono es SVG y no un emoji de `ICONS` porque un emoji no hereda
	 * `currentColor`: no se puede pintar en `--text-muted` ni se adapta al tema.
	 * Sigue la convención que ya usan `FilterBar` y `StatusSelect` —`fill: none`,
	 * `stroke: currentColor`, grosor 1.5— para no inventar un dialecto nuevo.
	 */
	let {
		/** 'calendar' | 'document' | 'box' */
		icon = 'document',
		title,
		description = '',
		actionLabel = '',
		actionHref = ''
	} = $props();
</script>

<div class="empty">
	<span class="empty-state-icon" aria-hidden="true">
		{#if icon === 'calendar'}
			<svg viewBox="0 0 24 24" width="24" height="24">
				<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
				<path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		{:else if icon === 'box'}
			<svg viewBox="0 0 24 24" width="24" height="24">
				<path
					d="M21 8.5v7a2 2 0 0 1-1.1 1.8l-7 3.4a2 2 0 0 1-1.8 0l-7-3.4A2 2 0 0 1 3 15.5v-7a2 2 0 0 1 1.1-1.8l7-3.4a2 2 0 0 1 1.8 0l7 3.4A2 2 0 0 1 21 8.5Z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				<path d="m3.5 7.5 8.5 4 8.5-4M12 11.5V21" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="24" height="24">
				<path
					d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linejoin="round"
				/>
				<path d="M14 3v5h5M9 13h6M9 17h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
		{/if}
	</span>

	<p class="empty-state-title">{title}</p>
	{#if description}
		<p class="empty-state-desc">{description}</p>
	{/if}
	{#if actionLabel && actionHref}
		<a class="btn-secondary" href={actionHref}>{actionLabel}</a>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-6) var(--sp-4);
		text-align: center;
		/* Ocupa el alto que le deje el panel: es lo que iguala las dos columnas
		   cuando una tiene lista y la otra no. */
		flex: 1;
	}

	/* Delta sobre `.empty-state-icon` de theme.css, que está a 3rem porque nació
	   para un emoji. Un icono de trazo a ese tamaño grita. */
	.empty-state-icon {
		display: flex;
		font-size: 0;
		color: var(--text-muted);
	}

	.empty-state-title {
		margin: 0;
	}

	.empty-state-desc {
		margin: 0 0 var(--sp-2);
	}
</style>
