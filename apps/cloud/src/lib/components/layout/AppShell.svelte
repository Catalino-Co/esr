<script>
	import { page } from '$app/state';
	import { sidebarCollapsed } from '$lib/stores/sidebar';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';

	let { user, company, role, permissions = [], children } = $props();

	let mobileOpen = $state(false);

	const pathname = $derived(page.url.pathname);

	function toggleSidebar() {
		// En movil el mismo boton abre y cierra el cajon; en escritorio
		// alterna entre barra completa y riel de iconos.
		if (typeof window !== 'undefined' && window.innerWidth <= 900) {
			mobileOpen = !mobileOpen;
			return;
		}
		sidebarCollapsed.toggle();
	}

	function handleMenuToggle() {
		mobileOpen = !mobileOpen;
	}

	function closeMobile() {
		mobileOpen = false;
	}
</script>

<div class="app-shell">
	{#if mobileOpen}
		<button type="button" class="sidebar-backdrop" aria-label="Cerrar menú" onclick={closeMobile}
		></button>
	{/if}

	<Sidebar
		{user}
		{company}
		{role}
		{pathname}
		{permissions}
		collapsed={$sidebarCollapsed}
		{mobileOpen}
		onToggle={toggleSidebar}
	/>

	<div class="app-main">
		<Topbar {pathname} {company} onMenuToggle={handleMenuToggle} />
		<main class="app-content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
		background: var(--bg-base);
	}

	.app-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.app-content {
		flex: 1;
		padding: var(--content-padding);
		overflow-x: auto;
	}

	.sidebar-backdrop {
		display: none;
	}

	@media (max-width: 900px) {
		.sidebar-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 30;
			border: none;
			background: rgba(15, 23, 42, 0.45);
			cursor: pointer;
		}
	}
</style>
