<script>
	import '@esr/config/theme.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { theme } from '$lib/stores/theme';
	import { sidebarCollapsed } from '$lib/stores/sidebar';

	let { children } = $props();

	onMount(() => {
		// El tema ya lo pinto el script inline de app.html; esto solo
		// sincroniza los stores con lo guardado.
		theme.init();
		sidebarCollapsed.init();
	});
</script>

{@render children()}
