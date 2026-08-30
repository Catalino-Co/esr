<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Eventos, Hoteles, Retail…' },
		{ name: 'description', label: 'Descripción', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'description', label: 'Descripción' }
	];
</script>

<CatalogManager
	hint="A qué se dedica el cliente. Es un campo opcional de su ficha y sirve para segmentar la cartera."
	{fields}
	{columns}
	size="sm"
	entries={data.entries}
	currentState={data.state}
	{form}
/>
