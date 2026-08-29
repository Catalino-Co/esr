<script>
	import CatalogManager from '$lib/components/settings/CatalogManager.svelte';

	let { data, form } = $props();

	const fields = [
		{ name: 'name', label: 'Nombre', required: true },
		{ name: 'service', label: 'Servicio', placeholder: 'Sonido, iluminación, transporte…' },
		{ name: 'contact', label: 'Persona de contacto' },
		{ name: 'phone', label: 'Teléfono' },
		{ name: 'email', label: 'Email', type: 'email' },
		{ name: 'notes', label: 'Notas', type: 'textarea' }
	];

	const columns = [
		{ field: 'name', label: 'Nombre' },
		{ field: 'service', label: 'Servicio' },
		{ field: 'contact', label: 'Contacto' },
		{ field: 'phone', label: 'Teléfono' },
		{ field: 'email', label: 'Email' }
	];
</script>

<CatalogManager
	title="Proveedores"
	hint="Empresas y personas a las que se subcontrata equipo o servicios."
	{fields}
	{columns}
	entries={data.entries}
	{form}
/>
