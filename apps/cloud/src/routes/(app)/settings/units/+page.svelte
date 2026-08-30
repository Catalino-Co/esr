<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true, placeholder: 'Unidad, Juego, Metro…' },
		{ name: 'abbr', label: 'Abreviatura', placeholder: 'ud' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'abbr', label: 'Abreviatura' }
	];
</script>

<CatalogManager
	hint="Cómo se cuenta cada artículo. La abreviatura es lo que acompaña a la cantidad en el inventario: «120 ud»."
	{fields}
	{columns}
	size="sm"
	entries={data.entries}
	currentState={data.state}
	{form}
/>
