<script>
	import Modal from './Modal.svelte';
	import { dangerModal } from '$lib/stores/dangerModal';

	/**
	 * Montado UNA sola vez, en el layout raiz. Reutiliza `Modal.svelte`, que ya
	 * resuelve foco, Escape y backdrop: `onclose` cubre las tres vias de cierre,
	 * asi que no hace falta el rodeo de un `subscribe` manual que si necesita el
	 * `Modal` de `@esr/ui` en ESR Pro.
	 */
</script>

{#if $dangerModal}
	<Modal open title={$dangerModal.title} size="sm" onclose={dangerModal.close}>
		<p class="alert-error" role="alert">{$dangerModal.message}</p>

		{#snippet footer()}
			<button type="button" class="btn-primary" onclick={dangerModal.close}>Entendido</button>
		{/snippet}
	</Modal>
{/if}
