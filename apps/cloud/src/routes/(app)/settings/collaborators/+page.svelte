<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true },
		{ name: 'role', label: 'Rol', placeholder: 'Técnico, chofer, despachador…' },
		{ name: 'phone', label: 'Teléfono' },
		{ name: 'email', label: 'Email', type: 'email' },
		{ name: 'notes', label: 'Notas', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'role', label: 'Rol' },
		{ field: 'phone', label: 'Teléfono' },
		{ field: 'email', label: 'Email' }
	];
</script>

<CatalogManager
	hint="Equipo que ejecuta la operación: técnicos, choferes, despachadores y montaje."
	{fields}
	{columns}
	entries={data.entries}
	currentState={data.state}
	{form}
/>
