<script>
	let { html, backHref, title = 'Documento' } = $props();

	function printDoc() {
		window.print();
	}
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div class="print-toolbar no-print">
	<a href={backHref} class="btn-back">← Volver</a>
	<button type="button" class="btn-print" onclick={printDoc}>Imprimir</button>
</div>

<iframe class="print-frame" title={title} srcdoc={html}></iframe>

<style>
	/* Las vistas de impresion son siempre claras, igual que el papel: el
	   documento va dentro de un iframe aislado, pero el cromo alrededor
	   heredaba el color de texto del tema oscuro sobre este fondo claro
	   fijo y quedaba casi invisible. Se fija la pareja fondo/texto. */
	:global(body) {
		margin: 0;
		background: #f0f4f8;
		color: #0f172a;
	}

	.print-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 20px;
		background: #fff;
		border-bottom: 1px solid #e2e8f0;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.btn-back,
	.btn-print {
		padding: 10px 16px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		text-decoration: none;
	}

	.btn-back {
		background: #e8edf3;
		color: #2563eb;
		border: 1px solid #e2e8f0;
	}

	.btn-print {
		background: #2563eb;
		color: #fff;
		border: none;
	}

	.print-frame {
		display: block;
		width: 100%;
		min-height: calc(100vh - 57px);
		border: none;
		background: #f5f7fb;
	}

	@media print {
		.print-frame {
			min-height: auto;
			height: auto;
		}
	}
</style>
