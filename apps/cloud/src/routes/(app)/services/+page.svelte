<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Maestría de Ceremonias' },
		{ name: 'price', label: 'Precio', type: 'number' },
		{ name: 'notes', label: 'Notas', type: 'textarea', full: true }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'price', label: 'Precio', kind: 'money' }
	];
</script>

<CatalogManager
	backHref="/dashboard"
	{fields}
	{columns}
	entries={data.entries}
	currentState={data.state}
	search={data.search}
	{form}
/>
