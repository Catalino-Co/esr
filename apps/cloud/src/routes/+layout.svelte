<script>
	import '@esr/config/theme.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { sidebarCollapsed } from '$lib/stores/sidebar';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import DangerModalHost from '$lib/components/DangerModalHost.svelte';

	let { children } = $props();

	onMount(() => {
		// El tema ya lo pinto el script inline de app.html; esto solo
		// sincroniza los stores con lo guardado.
		theme.init();
		sidebarCollapsed.init();
	});
</script>

<!-- Montados aqui y no dentro de `(app)/+layout.svelte`: este archivo cubre
     TAMBIEN `/login` y `/select-company`, que estan fuera de ese grupo. -->
<ToastContainer />
<DangerModalHost />

{@render children()}
