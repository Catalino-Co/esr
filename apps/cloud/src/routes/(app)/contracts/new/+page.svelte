<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const hoy = new Date().toISOString().slice(0, 10);
	const money = (v) =>
		Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
</script>

<section class="panel">
	<div class="page-header">
		<h1>Nuevo contrato</h1>
		<a class="btn-secondary" href="/quotes/{data.quote.id}">Volver a la cotización</a>
	</div>

	<p class="panel-hint">
		El contrato formaliza la cotización <strong>{data.quote.quote_number}</strong>. El monto
		acordado es el de esa cotización; el contrato no lleva importes propios.
	</p>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}

	<dl class="resumen">
		<div><dt>Número</dt><dd>{data.suggestedNumber}</dd></div>
		<div><dt>Cliente</dt><dd>{data.customer?.name ?? '—'}</dd></div>
		<div><dt>Evento</dt><dd>{data.event?.name ?? '—'}</dd></div>
		<div><dt>Total acordado</dt><dd class="destacado">{money(data.quote.total)}</dd></div>
	</dl>

	<form method="POST" class="form-grid" use:enhance>
		<input type="hidden" name="quotation_id" value={data.quote.id} />

		<div class="form-field">
			<label for="date">Fecha</label>
			<input id="date" name="date" type="date" value={hoy} />
		</div>
		<div class="form-field full">
			<label for="terms">Términos y condiciones</label>
			<textarea id="terms" name="terms" rows="6" placeholder="Condiciones de alquiler, penalidades, forma de pago…"></textarea>
		</div>
		<div class="form-field full">
			<label for="notes">Notas internas</label>
			<textarea id="notes" name="notes" rows="2"></textarea>
		</div>
		<div class="form-field full">
			<button type="submit" class="btn-primary">Crear contrato</button>
		</div>
	</form>
</section>

<style>
	.resumen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-4);
		margin: 0 0 var(--sp-5);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--border-radius);
		background: var(--bg-elevated);
	}

	.resumen dt {
		font-size: var(--font-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.resumen dd {
		margin: 2px 0 0;
		font-weight: 600;
	}

	.destacado {
		font-size: var(--font-lg);
		color: var(--text-brand);
	}
</style>
