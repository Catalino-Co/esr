<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Principal, Sucursal Este…' },
		{ name: 'code', label: 'Código', placeholder: 'PRIN' },
		{ name: 'address', label: 'Dirección' },
		{ name: 'notes', label: 'Notas', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'code', label: 'Código' },
		{ field: 'address', label: 'Dirección' }
	];
</script>

<CatalogManager
	hint="Dónde está físicamente la mercancía. El inventario se ve por almacén; cotizar y aprobar siguen mirando el total de la empresa."
	{fields}
	{columns}
	size="md"
	entries={data.entries}
	currentState={data.state}
	{form}
/>
