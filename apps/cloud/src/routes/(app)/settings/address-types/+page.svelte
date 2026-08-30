<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Sucursal, Almacén, Obra…' },
		{ name: 'description', label: 'Descripción', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'description', label: 'Descripción' }
	];
</script>

<CatalogManager
	hint="Clasifican las direcciones de servicio del cliente: dónde se entrega o se monta."
	{fields}
	{columns}
	size="sm"
	entries={data.entries}
	currentState={data.state}
	{form}
/>
