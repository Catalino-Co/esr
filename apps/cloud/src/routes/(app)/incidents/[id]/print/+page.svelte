<script>
	import PrintViewer from '$lib/components/print/PrintViewer.svelte';
	let { data } = $props();
</script>

<PrintViewer html={data.html} backHref={data.backHref} title={data.title} />
