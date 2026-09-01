<script>
	import { Icon } from '@esr/ui';
	import {
		formatDate,
		formatMoney,
		recordStateBadgeClass,
		recordStateLabel,
		statusBadgeClass,
		statusLabel
	} from '@esr/core';

	let { data } = $props();
</script>

<div class="herramientas">
	<div class="titulo">
		<div class="grupo">
			<a
				class="grupo-btn"
				href="/events/{data.event.id}"
				aria-label="Volver al evento"
				title="Volver al evento"
			>
				<Icon name="back" size={18} />
			</a>
		</div>
		<h1>Historial de cotizaciones</h1>
		<span class="evento">{data.event.name}</span>
	</div>
</div>

<section class="panel">
	<!-- Sin filtros a propósito: la ficha del evento ya esconde las canceladas y
	     las que están fuera de circulación, y esta pantalla existe para verlas.
	     Filtrar aquí sería volver a tapar lo que se vino a buscar. -->
	{#if data.quotes.length === 0}
		<p class="empty-state">Este evento no tiene ninguna cotización.</p>
	{:else}
		<div class="tabla-scroll">
			<table class="data-table data-table--acento">
				<thead>
					<tr>
						<th>Número</th>
						<th>Cliente</th>
						<th>Fecha</th>
						<th class="num">Total</th>
						<th>Estado</th>
						<!-- Dos ejes distintos, y aquí se ven los dos: un archivado no es
						     un cancelado. En la ficha solo se ve el de negocio. -->
						<th>Circulación</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.quotes as quote (quote.id)}
						<tr>
							<td>{quote.quote_number || `#${quote.id}`}</td>
							<td>{quote.client_name}</td>
							<td>{quote.date ? formatDate(quote.date) : '—'}</td>
							<td class="num">{formatMoney(quote.total)}</td>
							<td>
								<span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
							</td>
							<td>
								<span class="badge {recordStateBadgeClass(quote.is_active)}">
									{recordStateLabel(quote.is_active)}
								</span>
							</td>
							<td><a class="btn-view" href="/quotes/{quote.id}">Ver</a></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<style>
	.titulo {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
	}

	.titulo h1 {
		margin: 0;
		font-size: var(--font-xl);
	}

	.evento {
		color: var(--text-secondary);
	}

	.num {
		text-align: right;
		white-space: nowrap;
	}

	/* Siete columnas no caben en un teléfono: que scrollee la tabla, no la
	   página. */
	.tabla-scroll {
		overflow-x: auto;
	}
</style>
