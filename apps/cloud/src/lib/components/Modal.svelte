<script>
	/**
	 * Dialogo modal de ESR Cloud.
	 *
	 * Las clases (.modal-backdrop, .modal, .modal-header, .modal-body,
	 * .modal-footer) salen tal cual de theme.css, que ya las tenia escritas y
	 * sin usar por nadie. Aqui solo vive lo que el CSS no puede hacer: Escape,
	 * foco, `role="dialog"` y el bloqueo del scroll de fondo.
	 *
	 * No se reutiliza el Modal de @esr/ui: esta en API de Svelte 4, no tiene
	 * nada de esto, y lo consumen ocho pantallas de Desktop, asi que tocarlo
	 * las arrastraria.
	 */
	let {
		open = $bindable(false),
		title,
		/** 'sm' una columna | 'md' dos columnas | 'lg' tres. */
		size = 'md',
		onclose = null,
		children,
		footer = null
	} = $props();

	let caja = $state(null);
	/** A donde vuelve el foco al cerrar: el boton que abrio el dialogo. */
	let disparador = null;

	function cerrar() {
		open = false;
		onclose?.();
	}

	function alPulsarTecla(event) {
		if (!open) return;
		if (event.key === 'Escape') {
			event.preventDefault();
			cerrar();
			return;
		}
		if (event.key !== 'Tab' || !caja) return;

		// Trampa de foco: sin esto el tabulador se escapa al contenido de
		// detras, que para un lector de pantalla sigue existiendo.
		const focusables = caja.querySelectorAll(
			'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		);
		if (!focusables.length) return;
		const primero = focusables[0];
		const ultimo = focusables[focusables.length - 1];
		const activo = caja.ownerDocument.activeElement;

		if (event.shiftKey && activo === primero) {
			event.preventDefault();
			ultimo.focus();
		} else if (!event.shiftKey && activo === ultimo) {
			event.preventDefault();
			primero.focus();
		}
	}

	$effect(() => {
		if (!open) return;

		disparador = document.activeElement;
		// El fondo no debe scrollear por detras del dialogo.
		const overflowPrevio = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		// Al primer campo del CUERPO. Buscando en toda la caja saldria el boton
		// de cerrar, que va antes en orden de documento.
		const primerCampo = caja?.querySelector(
			'.modal-body input:not([type="hidden"]), .modal-body select, .modal-body textarea'
		);
		(primerCampo ?? caja)?.focus();

		return () => {
			document.body.style.overflow = overflowPrevio;
			disparador?.focus?.();
			disparador = null;
		};
	});
</script>

<svelte:window onkeydown={alPulsarTecla} />

{#if open}
	<!-- El backdrop cierra al pulsarlo. Es un div y no un boton porque envuelve
	     al dialogo; el teclado ya tiene Escape, que es la via esperada. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={cerrar}>
		<div
			bind:this={caja}
			class="modal"
			class:modal-sm={size === 'sm'}
			class:modal-lg={size === 'lg'}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
		>
			<div class="modal-header">
				<h2 class="modal-title">{title}</h2>
				<button type="button" class="modal-close" onclick={cerrar} aria-label="Cerrar">✕</button>
			</div>

			<div class="modal-body">
				{@render children()}
			</div>

			{#if footer}
				<div class="modal-footer">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* theme.css trae `.modal` (560px) y `.modal-lg` (800px); falta el estrecho,
	   para los formularios de dos campos, que en 560px salen en dos columnas
	   ridiculamente cortas. */
	.modal-sm {
		max-width: 420px;
	}

	/* El h2 hereda el tamaño de `.modal-title` de theme.css; solo hay que
	   quitarle el margen que el navegador le pone por ser un encabezado. */
	.modal-title {
		margin: 0;
	}
</style>
