<script>
	import { enhance } from '$app/forms';
	import { can } from '$lib/can';

	let { data, form } = $props();

	const contract = $derived(data.contract);
	const summary = $derived(data.summary);
	const hoy = new Date().toISOString().slice(0, 10);

	const money = (v) =>
		Number(v ?? 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

	const cancelado = $derived(contract.status === 'cancelado');
	const editable = $derived(!cancelado && can('contracts.update'));
</script>

<section class="panel">
	<div class="page-header">
		<h1>Contrato {contract.number || `#${contract.id}`}</h1>
		<div class="page-actions">
			<a class="btn-secondary" href="/contracts/{contract.id}/print" target="_blank" rel="noopener">
				Imprimir
			</a>
			<a class="btn-secondary" href="/contracts">Volver</a>
		</div>
	</div>

	{#if form?.error}
		<div class="alert-error" role="alert">{form.error}</div>
	{/if}
	{#if form?.success}
		<div class="alert-success" role="status">{form.success}</div>
	{/if}

	<dl class="resumen">
		<div><dt>Estado</dt><dd><span class="badge" class:badge-success={contract.status === 'firmado'} class:badge-danger={cancelado} class:badge-muted={contract.status === 'borrador'}>{contract.status}</span></dd></div>
		<div><dt>Cliente</dt><dd>{contract.client_name || '—'}</dd></div>
		<div><dt>Evento</dt><dd>{contract.event_name || '—'}</dd></div>
		<div>
			<dt>Cotización</dt>
			<dd>
				{#if contract.quotation_id}
					<a href="/quotes/{contract.quotation_id}">{contract.quote_number || '—'}</a>
				{:else}
					—
				{/if}
			</dd>
		</div>
	</dl>

	<div class="page-actions">
		{#if contract.status === 'borrador' && can('contracts.sign')}
			<form method="POST" action="?/sign" use:enhance>
				<button type="submit" class="btn-primary">Marcar como firmado</button>
			</form>
		{/if}
		{#if !cancelado && can('contracts.cancel')}
			<form method="POST" action="?/cancel" use:enhance>
				<button type="submit" class="btn-danger">Cancelar contrato</button>
			</form>
		{/if}
	</div>
</section>

<section class="panel">
	<h2 class="sec-title">Estado de cuenta</h2>
	<p class="panel-hint">
		El monto acordado sale de la cotización enlazada. Los pagos anulados no cuentan.
	</p>

	<div class="grid">
		<div class="metric">
			<strong>{money(summary.total)}</strong>
			<span>Total acordado</span>
		</div>
		<div class="metric">
			<strong>{money(summary.paid)}</strong>
			<span>Cobrado</span>
		</div>
		<div class="metric">
			<strong>{money(summary.pending)}</strong>
			<span>Pendiente de confirmar</span>
		</div>
		<div class="metric" class:metric-ok={summary.settled}>
			<strong>{summary.settled ? 'Saldado' : money(summary.balance)}</strong>
			<span>Saldo</span>
		</div>
	</div>

	{#if summary.overpaid > 0}
		<div class="alert-error" role="alert" style="margin-top: 16px">
			Se ha cobrado {money(summary.overpaid)} de más respecto al total acordado.
		</div>
	{/if}
</section>

{#if can('payments.register') && !cancelado}
	<section class="panel">
		<h2 class="sec-title">Registrar pago</h2>
		<form method="POST" action="?/registerPayment" class="form-grid" use:enhance>
			<div class="form-field">
				<label for="amount">Importe *</label>
				<input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
			</div>
			<div class="form-field">
				<label for="date">Fecha</label>
				<input id="date" name="date" type="date" value={hoy} />
			</div>
			<div class="form-field">
				<label for="method">Método</label>
				<select id="method" name="method">
					<option value="efectivo">Efectivo</option>
					<option value="transferencia">Transferencia</option>
					<option value="cheque">Cheque</option>
					<option value="tarjeta">Tarjeta</option>
					<option value="otro">Otro</option>
				</select>
			</div>
			<div class="form-field">
				<label for="status">Estado</label>
				<select id="status" name="status">
					<option value="pagado">Pagado</option>
					<option value="pendiente">Pendiente de confirmar</option>
				</select>
			</div>
			<div class="form-field">
				<label for="reference">Referencia</label>
				<input id="reference" name="reference" placeholder="Nº de transferencia, cheque…" />
			</div>
			<div class="form-field full">
				<label for="notes">Notas</label>
				<input id="notes" name="notes" />
			</div>
			<div class="form-actions">
				<button type="submit" class="btn-primary">Registrar pago</button>
			</div>
		</form>
	</section>
{/if}

<section class="panel">
	<h2 class="sec-title">Pagos ({data.payments.length})</h2>

	{#if data.payments.length === 0}
		<p class="empty-state">Todavía no se ha registrado ningún pago.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Fecha</th>
					<th class="num">Importe</th>
					<th>Método</th>
					<th>Referencia</th>
					<th>Estado</th>
					<th>Origen</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.payments as payment (payment.id)}
					{@const anulado = payment.status === 'anulado'}
					<tr class:fila-anulada={anulado}>
						<td>{payment.date || '—'}</td>
						<td class="num">{money(payment.amount)}</td>
						<td>{payment.method || '—'}</td>
						<td>{payment.reference || '—'}</td>
						<td>
							<span
								class="badge"
								class:badge-success={payment.status === 'pagado'}
								class:badge-warning={payment.status === 'pendiente'}
								class:badge-danger={anulado}
							>
								{payment.status}
							</span>
						</td>
						<td class="origen">
							{payment.contract_id ? 'Contrato' : 'Cotización'}
						</td>
						<td>
							{#if !anulado && can('payments.void')}
								<form method="POST" action="?/voidPayment" use:enhance>
									<input type="hidden" name="payment_id" value={payment.id} />
									<button type="submit" class="btn-link">Anular</button>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<section class="panel">
	<h2 class="sec-title">Datos del contrato</h2>

	<form method="POST" action="?/update" class="form-grid" use:enhance>
		<div class="form-field">
			<label for="c-date">Fecha</label>
			<input id="c-date" name="date" type="date" value={contract.date ?? ''} disabled={!editable} />
		</div>
		<div class="form-field full">
			<label for="c-terms">Términos y condiciones</label>
			<textarea id="c-terms" name="terms" rows="6" disabled={!editable}>{contract.terms ?? ''}</textarea>
		</div>
		<div class="form-field full">
			<label for="c-notes">Notas internas</label>
			<textarea id="c-notes" name="notes" rows="2" disabled={!editable}>{contract.notes ?? ''}</textarea>
		</div>
		<div class="form-actions">
			{#if editable}
				<button type="submit" class="btn-primary">Guardar cambios</button>
			{:else}
				<p class="panel-hint">
					{cancelado
						? 'Un contrato cancelado no se puede editar.'
						: 'Su rol no permite editar este contrato.'}
				</p>
			{/if}
		</div>
	</form>
</section>

<style>
	.sec-title {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-md);
		font-weight: 600;
	}

	.resumen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-4);
		margin: 0 0 var(--sp-5);
	}

	.resumen dt {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	.resumen dd {
		margin: 4px 0 0;
		font-weight: 600;
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	.origen {
		font-size: var(--font-xs);
		color: var(--text-muted);
	}

	/* Un pago anulado sigue visible: es parte del rastro. */
	.fila-anulada td {
		opacity: 0.55;
		text-decoration: line-through;
	}

	.fila-anulada td:last-child {
		text-decoration: none;
	}

	.metric-ok strong {
		color: var(--text-success);
	}
</style>
