<script>
	import { page } from '$app/state';
	import { ICONS } from '@esr/ui/icons';
	import { settingsSectionFor } from '$lib/settings-sections';

	let { children } = $props();

	/**
	 * Solo dentro de una seccion: en la portada no hay adonde volver.
	 *
	 * Es un enlace de vuelta, no una miga completa: el topbar ya enuncia el
	 * nombre y la descripcion de la seccion justo encima, asi que repetirlo
	 * aqui seria la tercera vez en dos centimetros. Sustituye a los siete
	 * botones «Volver» que cada subpagina se pintaba por su cuenta.
	 */
	const section = $derived(settingsSectionFor(page.url.pathname));
</script>

{#if section}
	<a class="settings-back" href="/settings">
		<span aria-hidden="true">{ICONS.back}</span>
		Configuración
	</a>
{/if}

{@render children()}

<style>
	.settings-back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0 0 var(--sp-4) -8px;
		padding: 4px 8px;
		border-radius: var(--radius);
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-secondary);
	}

	.settings-back:hover {
		background: var(--surface-sunken);
		color: var(--text-primary);
	}

	.settings-back:focus-visible {
		outline: none;
		box-shadow: var(--focus-ring);
	}
</style>
