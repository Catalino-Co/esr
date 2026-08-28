<script>
	import { resolvePageMeta } from '$lib/navigation';
	import UserMenu from './UserMenu.svelte';

	let { pathname, user, company, role, onMenuToggle = () => {} } = $props();

	const meta = $derived(resolvePageMeta(pathname));
</script>

<header class="topbar">
	<div class="topbar-left">
		<button type="button" class="mobile-menu-btn" onclick={onMenuToggle} aria-label="Abrir menú">☰</button>
		<div class="topbar-titles">
			<h1>{meta.title}</h1>
			<p>{meta.subtitle}</p>
		</div>
	</div>

	<div class="topbar-center">
		<label class="search-shell">
			<span class="search-icon" aria-hidden="true">⌕</span>
			<input type="search" placeholder="Buscar cliente, evento, cotización…" disabled aria-label="Búsqueda global (próximamente)" />
		</label>
	</div>

	<div class="topbar-right">
		<span class="company-pill">{company?.name ?? '—'}</span>
		<UserMenu {user} {role} {company} />
	</div>
</header>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 24px;
		background: var(--cloud-surface);
		border-bottom: 1px solid var(--cloud-border);
		min-height: var(--topbar-height);
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
		flex: 1;
	}

	.mobile-menu-btn {
		display: none;
		padding: 8px 10px;
		border: 1px solid var(--cloud-border);
		border-radius: 8px;
		background: var(--cloud-surface);
		cursor: pointer;
		font-size: 1rem;
	}

	.topbar-titles h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--cloud-text);
		line-height: 1.2;
	}

	.topbar-titles p {
		margin: 2px 0 0;
		font-size: 0.82rem;
		color: var(--cloud-muted);
		line-height: 1.3;
	}

	.topbar-center {
		flex: 1.2;
		max-width: 420px;
	}

	.search-shell {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		height: 40px;
		border: 1px solid var(--cloud-border);
		border-radius: 999px;
		background: var(--cloud-bg);
	}

	.search-icon {
		color: var(--cloud-muted);
		font-size: 0.95rem;
	}

	.search-shell input {
		flex: 1;
		border: none;
		background: transparent;
		outline: none;
		font-size: 0.88rem;
		color: var(--cloud-text);
	}

	.search-shell input:disabled {
		cursor: not-allowed;
		opacity: 0.75;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-shrink: 0;
	}

	.company-pill {
		padding: 6px 12px;
		border-radius: 999px;
		background: var(--cloud-primary-soft);
		color: var(--cloud-primary);
		font-size: 0.78rem;
		font-weight: 600;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (max-width: 900px) {
		.mobile-menu-btn {
			display: inline-flex;
		}

		.topbar-center {
			display: none;
		}

		.company-pill {
			display: none;
		}
	}
</style>
