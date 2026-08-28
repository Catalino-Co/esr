<script>
	let { data } = $props();

	const sections = [
		{
			href: '/settings/appearance',
			title: 'Apariencia',
			description: 'Tema claro u oscuro de la aplicación. Es una preferencia tuya, no de la empresa.',
			permission: null
		},
		{
			href: '/settings/company',
			title: 'Datos de la empresa',
			description: 'Nombre, RNC, teléfono, email y dirección que aparecen en cotizaciones, órdenes y conduces.',
			permission: 'settings.company.update'
		},
		{
			href: '/settings/members',
			title: 'Miembros y roles',
			description: 'Invita usuarios existentes a la empresa y define qué puede hacer cada uno.',
			permission: 'settings.members.manage'
		}
	];

	const visible = $derived(
		sections.filter((section) => !section.permission || data.permissions.includes(section.permission))
	);
</script>

<section class="panel">
	{#if visible.length}
		<div class="settings-cards">
			{#each visible as section (section.href)}
				<a class="settings-card" href={section.href}>
					<strong>{section.title}</strong>
					<span>{section.description}</span>
				</a>
			{/each}
		</div>
	{:else}
		<p class="settings-empty">Su rol no tiene secciones de configuración disponibles.</p>
	{/if}
</section>

<style>
	.settings-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 16px;
	}

	.settings-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 18px;
		border: 1px solid var(--cloud-border);
		border-radius: 10px;
		background: var(--cloud-surface);
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.settings-card:hover {
		border-color: var(--cloud-primary);
		box-shadow: var(--cloud-shadow-md);
	}

	.settings-card strong {
		font-size: 1rem;
		color: var(--cloud-text);
	}

	.settings-card span {
		font-size: 0.86rem;
		color: var(--cloud-muted);
		line-height: 1.5;
	}

	.settings-empty {
		color: var(--cloud-muted);
		margin: 0;
	}
</style>
