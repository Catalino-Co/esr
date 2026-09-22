<script>
	/**
	 * Barra de pestañas, compartida por las DOS apps.
	 *
	 * Solo la BARRA: no envuelve contenido. La página sigue resolviendo qué
	 * mostrar con `{#if active === '...'}`, igual que ya hace el interruptor
	 * "Rango rápido" (Mes/Trimestre/Año) de los reportes -así funciona en
	 * runas (Cloud) y en Svelte 4 clásico (Desktop) sin ningún truco extra,
	 * mismo motivo por el que `SearchPicker.svelte` tampoco usa runas-.
	 */

	/** @type {Array<{ key: string, label: string }>} */
	export let tabs = [];
	/** Bindable: la pestaña activa. */
	export let active = tabs[0]?.key;
	/** Callback opcional, ademas del binding. */
	export let onchange = null;

	function elegir(key) {
		if (active === key) return;
		active = key;
		onchange?.(key);
	}
</script>

<div class="tabs" role="tablist">
	{#each tabs as tab (tab.key)}
		<button
			type="button"
			role="tab"
			id="tab-{tab.key}"
			aria-selected={active === tab.key}
			aria-controls="panel-{tab.key}"
			class="tab"
			class:tab--activa={active === tab.key}
			on:click={() => elegir(tab.key)}
		>
			{tab.label}
		</button>
	{/each}
</div>
