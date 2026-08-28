<script>
	import { ICONS } from '@esr/ui/icons';
	import { navItems, isNavActive } from '$lib/navigation.js';

	export let pathname = '/';
	export let collapsed = false;
	export let user = null;
	export let onToggle = () => {};
	export let onLogout = () => {};

	$: toggleLabel = collapsed ? 'Expandir menú' : 'Colapsar menú';
	$: initial = user?.name?.charAt(0)?.toUpperCase() ?? user?.username?.charAt(0)?.toUpperCase() ?? 'U';
</script>

<nav class="sidebar" class:sidebar--collapsed={collapsed} aria-label="Navegación principal">
	<div class="sidebar-brand">
		<span class="sidebar-brand-icon" aria-hidden="true">{ICONS.brand}</span>
		<span class="sidebar-brand-text">
			<span class="sidebar-brand-name">ESR Pro</span>
			<span class="sidebar-brand-sub">Control operativo</span>
		</span>
		<button
			type="button"
			class="btn-collapse"
			aria-label={toggleLabel}
			aria-expanded={!collapsed}
			title={toggleLabel}
			on:click={onToggle}
		>
			<span aria-hidden="true">{collapsed ? ICONS.expand : ICONS.collapse}</span>
		</button>
	</div>

	<div class="sidebar-nav">
		<div class="nav-group">
			{#each navItems as item (item.path)}
				<a
					href={item.path}
					class="nav-item"
					class:nav-item--active={isNavActive(pathname, item.path)}
					title={collapsed ? item.label : undefined}
					aria-current={isNavActive(pathname, item.path) ? 'page' : undefined}
				>
					<span class="nav-item-icon" aria-hidden="true">{item.icon}</span>
					<span class="nav-item-label">{item.label}</span>
				</a>
			{/each}
		</div>
	</div>

	<div class="sidebar-footer">
		<div class="sidebar-user" title={collapsed ? (user?.name ?? user?.username) : undefined}>
			<div class="sidebar-user-avatar" aria-hidden="true">{initial}</div>
			<div class="sidebar-user-info">
				<span class="sidebar-user-name">{user?.name ?? user?.username ?? 'Usuario'}</span>
				<span class="sidebar-user-role">{user?.role ?? 'Local'}</span>
			</div>
		</div>
		<button
			type="button"
			class="btn-logout"
			on:click={onLogout}
			title="Cerrar sesión"
			aria-label="Cerrar sesión"
		>
			{ICONS.logout}
		</button>
	</div>
</nav>
