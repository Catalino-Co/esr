<script>
	import { visibleNavGroups } from '$lib/navigation';
	import NavItem from './NavItem.svelte';

	let {
		company,
		pathname,
		permissions = [],
		collapsed = false,
		mobileOpen = false,
		onToggle = () => {}
	} = $props();

	const groups = $derived(visibleNavGroups(permissions));
</script>

<aside class="sidebar" class:collapsed class:mobile-open={mobileOpen} aria-label="Navegación principal">
	<div class="sidebar-brand">
		<a href="/dashboard" class="brand-link">
			<span class="brand-mark">ESR</span>
			{#if !collapsed}
				<span class="brand-text">
					<strong>Cloud</strong>
					<small>Plataforma operativa</small>
				</span>
			{/if}
		</a>
	</div>

	{#if !collapsed && company}
		<div class="sidebar-company">
			<span class="sidebar-company-label">Empresa activa</span>
			<strong>{company.name}</strong>
		</div>
	{/if}

	<nav class="sidebar-nav">
		{#each groups as group (group.title)}
			{#if !collapsed}
				<p class="nav-group-title">{group.title}</p>
			{/if}
			<div class="nav-group">
				{#each group.items as item (item.href)}
					<NavItem {...item} {pathname} {collapsed} />
				{/each}
			</div>
		{/each}
	</nav>

	<div class="sidebar-footer">
		<button type="button" class="sidebar-toggle" onclick={onToggle} aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
			{collapsed ? '→' : '←'}
		</button>
	</div>
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: var(--sidebar-width);
		min-height: 100vh;
		background: linear-gradient(180deg, var(--cloud-sidebar) 0%, #0b1220 100%);
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		transition: width 0.2s ease;
		flex-shrink: 0;
	}

	.sidebar.collapsed {
		width: var(--sidebar-width-collapsed);
	}

	.sidebar-brand {
		padding: 20px 16px 12px;
	}

	.brand-link {
		display: flex;
		align-items: center;
		gap: 12px;
		color: #fff;
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--cloud-primary);
		font-weight: 800;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		flex-shrink: 0;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		line-height: 1.2;
	}

	.brand-text strong {
		font-size: 1.05rem;
	}

	.brand-text small {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.55);
		font-weight: 500;
	}

	.sidebar-company {
		margin: 0 12px 16px;
		padding: 10px 12px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.sidebar-company-label {
		display: block;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: rgba(255, 255, 255, 0.45);
		margin-bottom: 4px;
	}

	.sidebar-company strong {
		display: block;
		color: #fff;
		font-size: 0.88rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.sidebar-nav {
		flex: 1;
		overflow-y: auto;
		padding: 0 10px 16px;
	}

	.nav-group-title {
		margin: 16px 8px 6px;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: rgba(255, 255, 255, 0.38);
	}

	.nav-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.sidebar-footer {
		padding: 12px;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}

	.sidebar-toggle {
		width: 100%;
		padding: 8px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.04);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		font-size: 0.9rem;
	}

	.sidebar-toggle:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	@media (max-width: 900px) {
		.sidebar {
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			z-index: 40;
			transform: translateX(-100%);
			transition: transform 0.2s ease, width 0.2s ease;
		}

		.sidebar.mobile-open {
			transform: translateX(0);
		}

		.sidebar.collapsed:not(.mobile-open) {
			width: var(--sidebar-width);
		}
	}
</style>
