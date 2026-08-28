<script>
	import { page } from '$app/state';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';

	let { user, company, role, permissions = [], children } = $props();

	let sidebarCollapsed = $state(false);
	let mobileOpen = $state(false);

	const pathname = $derived(page.url.pathname);

	function toggleSidebar() {
		if (typeof window !== 'undefined' && window.innerWidth <= 900) {
			mobileOpen = !mobileOpen;
			return;
		}
		sidebarCollapsed = !sidebarCollapsed;
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
		<button type="button" class="sidebar-backdrop" aria-label="Cerrar menú" onclick={closeMobile}></button>
	{/if}

	<Sidebar {company} {pathname} {permissions} collapsed={sidebarCollapsed} {mobileOpen} onToggle={toggleSidebar} />

	<div class="app-main">
		<Topbar {pathname} {user} {company} {role} onMenuToggle={handleMenuToggle} />
		<main class="app-content">
			{@render children()}
		</main>
	</div>
</div>

<style>
	.app-shell {
		display: flex;
		min-height: 100vh;
		background: var(--cloud-bg);
	}

	.app-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.app-content {
		flex: 1;
		padding: 24px;
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
