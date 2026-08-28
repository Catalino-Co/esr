<script>
	import { roleLabel } from '@esr/core';
	import { ICONS } from '@esr/ui/icons';
	import { visibleNavItems, isNavActive } from '$lib/navigation';

	let {
		user,
		company,
		role,
		pathname,
		permissions = [],
		collapsed = false,
		mobileOpen = false,
		onToggle = () => {}
	} = $props();

	const items = $derived(visibleNavItems(permissions));
	const toggleLabel = $derived(collapsed ? 'Expandir menú' : 'Colapsar menú');
	const initial = $derived(user?.name?.charAt(0)?.toUpperCase() ?? 'U');
</script>

<nav
	class="sidebar"
	class:sidebar--collapsed={collapsed}
	class:sidebar--mobile-open={mobileOpen}
	aria-label="Navegación principal"
>
	<div class="sidebar-brand">
		<span class="sidebar-brand-icon" aria-hidden="true">{ICONS.brand}</span>
		<span class="sidebar-brand-text">
			<span class="sidebar-brand-name">ESR Cloud</span>
			<span class="sidebar-brand-sub">{company?.name ?? 'Plataforma operativa'}</span>
		</span>
		<button
			type="button"
			class="btn-collapse"
			aria-label={toggleLabel}
			aria-expanded={!collapsed}
			title={toggleLabel}
			onclick={onToggle}
		>
			<span aria-hidden="true">{collapsed ? ICONS.expand : ICONS.collapse}</span>
		</button>
	</div>

	<div class="sidebar-nav">
		<div class="nav-group">
			{#each items as item (item.href)}
				{@const active = isNavActive(pathname, item.matchPrefix)}
				<a
					href={item.href}
					class="nav-item"
					class:nav-item--active={active}
					title={collapsed ? item.label : undefined}
					aria-current={active ? 'page' : undefined}
				>
					<span class="nav-item-icon" aria-hidden="true">{item.icon}</span>
					<span class="nav-item-label">{item.label}</span>
				</a>
			{/each}
		</div>
	</div>

	<div class="sidebar-footer">
		<div class="sidebar-user" title={collapsed ? user?.name : undefined}>
			<div class="sidebar-user-avatar" aria-hidden="true">{initial}</div>
			<div class="sidebar-user-info">
				<span class="sidebar-user-name">{user?.name ?? 'Usuario'}</span>
				<span class="sidebar-user-role">{roleLabel(role)}</span>
			</div>
		</div>
		<form method="POST" action="/logout">
			<button type="submit" class="btn-logout" title="Cerrar sesión" aria-label="Cerrar sesión">
				{ICONS.logout}
			</button>
		</form>
	</div>
</nav>

<style>
	/* Cloud es web, no solo escritorio: Workshop no tiene nada de esto
	   porque asume >=1000px. Debajo de 900px la barra pasa a ser un
	   cajon deslizante sobre el contenido. */
	@media (max-width: 900px) {
		.sidebar {
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			z-index: 40;
			transform: translateX(-100%);
			transition:
				transform var(--transition-base),
				width var(--transition-base);
		}

		.sidebar--mobile-open {
			transform: translateX(0);
		}

		/* En movil el cajon siempre se muestra completo: un riel de 60px
		   sobre el contenido no aporta nada. */
		.sidebar.sidebar--collapsed:not(.sidebar--mobile-open) {
			width: var(--sidebar-width);
			min-width: var(--sidebar-width);
		}
	}
</style>
