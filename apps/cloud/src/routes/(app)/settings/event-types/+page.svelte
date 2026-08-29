<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Boda, Corporativo, Cumpleaños…' },
		{ name: 'color', label: 'Color', type: 'color' },
		{ name: 'description', label: 'Descripción', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'color', label: 'Color', kind: 'color' },
		{ field: 'description', label: 'Descripción' }
	];
</script>

<CatalogManager
	title="Tipos de evento"
	hint="Clasifican los eventos de la empresa. Se usan al crear un evento y en los reportes."
	{fields}
	{columns}
	entries={data.entries}
	{form}
/>
