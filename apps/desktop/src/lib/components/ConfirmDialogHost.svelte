<script>
	import { onDestroy } from 'svelte';
	import { Modal } from '@esr/ui';
	import { confirmDialog } from '$lib/stores/confirmDialog.js';

	/**
	 * Montado UNA sola vez, en el layout raiz. Mismo patron de `subscribe`
	 * manual que `DangerModalHost`, y por la misma razon: si el usuario cierra
	 * con el backdrop o la X sin elegir boton, hay que resolver la promesa
	 * pendiente como `false` — si no, quien esta esperando el `await` se
	 * quedaria colgado para siempre.
	 */
	let show = false;
	let detalle = null;
	const unsub = confirmDialog.subscribe((v) => {
		detalle = v;
		show = v !== null;
	});
	onDestroy(unsub);

	$: if (!show && detalle) confirmDialog.cancel();
</script>

{#if detalle}
	<Modal bind:show title={detalle.title} maxWidth="420px">
		<p>{detalle.message}</p>
		<svelte:fragment slot="footer">
			<button type="button" class="btn btn-secondary" on:click={confirmDialog.cancel}>
				{detalle.cancelar}
			</button>
			<button
				type="button"
				class="btn {detalle.danger ? 'btn-danger' : 'btn-primary'}"
				on:click={confirmDialog.accept}
			>
				{detalle.aceptar}
			</button>
		</svelte:fragment>
	</Modal>
{/if}
