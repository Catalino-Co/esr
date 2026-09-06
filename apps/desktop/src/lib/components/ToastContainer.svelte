<script>
	import { Icon } from '@esr/ui';
	import { toasts } from '$lib/stores/toasts.js';

	/**
	 * Montado UNA sola vez, en el layout raiz. Las clases `.toast*` ya viven en
	 * theme.css desde hace tiempo. Gemelo del de Cloud.
	 */
</script>

<div class="toast-container" role="status" aria-live="polite">
	{#each $toasts as toast (toast.id)}
		<div class="toast toast-{toast.type}">
			<div class="toast-cuerpo">
				<span>{toast.message}</span>
				{#if toast.items?.length}
					<ul>
						{#each toast.items as item (item)}<li>{item}</li>{/each}
					</ul>
				{/if}
			</div>
			<button
				type="button"
				class="toast-cerrar"
				on:click={() => toasts.dismiss(toast.id)}
				aria-label="Cerrar aviso"
			>
				<Icon name="x" size={12} />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-2);
	}

	.toast-cuerpo {
		min-width: 0;
	}

	.toast-cuerpo ul {
		margin: var(--sp-1) 0 0;
		padding-left: var(--sp-4);
	}

	.toast-cerrar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1.25rem;
		height: 1.25rem;
		margin-top: 1px;
		border: none;
		background: none;
		color: inherit;
		opacity: 0.7;
		cursor: pointer;
	}

	.toast-cerrar:hover {
		opacity: 1;
	}
</style>
