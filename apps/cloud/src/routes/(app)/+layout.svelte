<script>
	import AppShell from '$lib/components/layout/AppShell.svelte';

	let { data, children } = $props();
</script>

<AppShell user={data.user} company={data.company} role={data.role} permissions={data.permissions}>
	{@render children()}
</AppShell>
