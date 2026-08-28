<script>
	import { page } from '$app/state';

	let { children } = $props();

	const sections = [
		// Apariencia no lleva permiso: es preferencia personal del usuario.
		{ href: '/settings/appearance', label: 'Apariencia', permission: null },
		{ href: '/settings/company', label: 'Empresa', permission: 'settings.company.update' },
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

	.settings-tab {
		padding: 10px 16px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--cloud-muted);
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
