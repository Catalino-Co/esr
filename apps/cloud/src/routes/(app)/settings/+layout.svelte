<script>
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		// Apariencia no lleva permiso: es preferencia personal del usuario.
		{ href: '/settings/appearance', label: 'Apariencia', permission: null },
		{ href: '/settings/company', label: 'Empresa', permission: 'settings.company.update' },
		{ href: '/settings/categories', label: 'Categorías', permission: 'settings.catalogs.manage' },
		{ href: '/settings/event-types', label: 'Tipos de evento', permission: 'settings.catalogs.manage' },
		{ href: '/settings/suppliers', label: 'Proveedores', permission: 'settings.catalogs.manage' },
		{ href: '/settings/collaborators', label: 'Colaboradores', permission: 'settings.catalogs.manage' },
		{ href: '/settings/members', label: 'Miembros', permission: 'settings.members.manage' }
	];

	const permissions = $derived(page.data.permissions ?? []);
	const visible = $derived(
		sections.filter((section) => !section.permission || permissions.includes(section.permission))
	);
	const pathname = $derived(page.url.pathname);
</script>

{#if visible.length}
	<nav class="settings-tabs" aria-label="Secciones de configuración">
		{#each visible as section (section.href)}
			<a
				href={section.href}
				class="settings-tab"
				class:active={pathname === section.href}
				aria-current={pathname === section.href ? 'page' : undefined}
			>
				{section.label}
			</a>
		{/each}
	</nav>
{/if}

{@render children()}

<style>
	.settings-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 20px;
		border-bottom: 1px solid var(--cloud-border);
	}

	/* --text-muted da 4.8:1 sobre blanco, pero estas pestañas van sobre
	   --surface-sunken y ahi se queda en 4.47:1, justo por debajo de AA.
	   El escalon de arriba, --text-secondary, aguanta los dos fondos. */
	.settings-tab {
		padding: 10px 16px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-secondary);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}

	.settings-tab:hover {
		color: var(--cloud-text);
	}

	.settings-tab.active {
		color: var(--cloud-primary);
		border-bottom-color: var(--cloud-primary);
	}
</style>
