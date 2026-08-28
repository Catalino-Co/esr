<script>
	let { title, subtitle = '', actions } = $props();
</script>

<div class="page-header-block">
	<div>
		<h2>{title}</h2>
		{#if subtitle}
			<p>{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="page-header-actions">
			{@render actions()}
		</div>
	{/if}
</div>

<style>
	.page-header-block {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}

	.page-header-block h2 {
		margin: 0;
		font-size: 1.35rem;
		color: var(--cloud-text);
	}

	.page-header-block p {
		margin: 4px 0 0;
		font-size: 0.9rem;
		color: var(--cloud-muted);
	}

	.page-header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
