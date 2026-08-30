<script>
	import { ICONS } from '@esr/ui/icons';
	import { resolvePageMeta } from '$lib/navigation';

	// La identidad del usuario vive en el pie de la barra lateral, como en
	// CCO Workshop. Aqui solo queda el contexto de la pagina.
	let { pathname, company, onMenuToggle = () => {} } = $props();

	const meta = $derived(resolvePageMeta(pathname));
</script>

<header class="topbar">
	<div class="topbar-left">
		<button type="button" class="mobile-menu-btn" onclick={onMenuToggle} aria-label="Abrir menú">
			{ICONS.menu}
		</button>
		<div class="topbar-titles">
			<h1>{meta.title}</h1>
			<p>{meta.subtitle}</p>
		</div>
	</div>

	<div class="topbar-right">
		<span class="company-pill">{company?.name ?? '—'}</span>
	</div>
</header>

<style>
	/* `.topbar`, `.topbar-left`, `.topbar-titles`, `.topbar-right` y
	   `.company-pill` viven en @esr/config/theme.css: Cloud y Desktop deben
	   tener la cabecera identica. Aqui solo queda lo propio de Cloud. */

	/* El boton de menu solo existe en Cloud: Desktop no tiene caso movil. */
	.mobile-menu-btn {
		display: none;
		background: none;
		border: none;
		font-size: var(--font-lg);
		color: var(--text-secondary);
		cursor: pointer;
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--border-radius-sm);
	}

	.mobile-menu-btn:hover {
		background: var(--bg-hover);
	}

	@media (max-width: 900px) {
		.mobile-menu-btn {
			display: block;
		}
	}

	@media (max-width: 640px) {
		.company-pill {
			display: none;
		}
	}
</style>
