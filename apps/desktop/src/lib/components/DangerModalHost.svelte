<script>
	import { onDestroy } from 'svelte';
	import { Modal } from '@esr/ui';
	import { dangerModal } from '$lib/stores/dangerModal.js';

	/**
	 * Montado UNA sola vez, en el layout raiz.
	 *
	 * El `Modal` de `@esr/ui` solo tiene `bind:show` —sin evento de cierre—, asi
	 * que hace falta un `subscribe` manual: `detalle` guarda el error activo y
	 * `show` sigue al store. Cuando el Modal se cierra por su cuenta (backdrop o
	 * la X) pone `show=false` via el bind, y la guarda de abajo lo detecta y
	 * avisa al store — si no, el store se quedaria pensando que el dialogo
	 * sigue abierto.
	 */
	let show = false;
	let detalle = null;
	const unsub = dangerModal.subscribe((v) => {
		detalle = v;
		show = v !== null;
	});
	onDestroy(unsub);

	$: if (!show && detalle) dangerModal.close();
</script>

{#if detalle}
	<Modal bind:show title={detalle.title} maxWidth="480px">
		<p class="alert alert-danger">{detalle.message}</p>
		<svelte:fragment slot="footer">
			<button type="button" class="btn btn-primary" on:click={dangerModal.close}>Entendido</button>
		</svelte:fragment>
	</Modal>
{/if}
