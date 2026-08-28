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

	<div class="topbar-center">
		<label class="search-shell">
			<span class="search-icon" aria-hidden="true">{ICONS.search}</span>
			<input
				type="search"
				placeholder="Buscar cliente, evento, cotización…"
				disabled
				aria-label="Búsqueda global (próximamente)"
			/>
		</label>
	</div>

	<div class="topbar-right">
		<span class="company-pill">{company?.name ?? '—'}</span>
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-4) var(--sp-6);
		background: var(--bg-surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-width: 0;
	}

	.topbar-titles h1 {
		margin: 0;
		font-size: var(--font-xl);
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.topbar-titles p {
		margin: 2px 0 0;
		font-size: var(--font-sm);
		color: var(--text-muted);
	}

	.topbar-center {
		flex: 1;
		max-width: 420px;
	}

	.search-shell {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-input);
	}

	.search-icon {
		font-size: var(--font-sm);
		color: var(--text-muted);
	}

	.search-shell input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font-size: var(--font-sm);
		color: var(--text-primary);
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.company-pill {
		padding: var(--sp-1) var(--sp-3);
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--text-secondary);
		font-size: var(--font-xs);
		font-weight: 600;
		white-space: nowrap;
	}

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

		.topbar-center {
			display: none;
		}
	}

	@media (max-width: 640px) {
		.company-pill {
			display: none;
		}
	}
</style>
