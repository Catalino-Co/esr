<script>
	import { isNavActive } from '$lib/navigation';

	let { href, label, icon, matchPrefix, pathname, collapsed = false } = $props();

	const active = $derived(isNavActive(pathname, matchPrefix));
</script>

<a class="nav-item" class:active href={href} title={label} aria-current={active ? 'page' : undefined}>
	<span class="nav-item-icon" aria-hidden="true">{icon}</span>
	{#if !collapsed}
		<span class="nav-item-label">{label}</span>
	{/if}
</a>

<style>
	.nav-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.72);
		font-size: 0.92rem;
		font-weight: 500;
		transition: background 0.15s ease, color 0.15s ease;
	}

	.nav-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
	}

	.nav-item.active {
		background: rgba(255, 255, 255, 0.12);
		color: #fff;
		box-shadow: inset 3px 0 0 var(--cloud-primary);
	}

	.nav-item-icon {
		width: 1.25rem;
		text-align: center;
		flex-shrink: 0;
		opacity: 0.9;
		font-size: 0.85rem;
	}

	.nav-item-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
