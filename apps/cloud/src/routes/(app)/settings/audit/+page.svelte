<script>
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon } from '@esr/ui';
	import FilterBar from '$lib/components/list/FilterBar.svelte';
	let { data } = $props();

	function formatDate(value) {
		if (!value) return '—';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-DO');
	}

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	/** @param {Record<string, string | null>} cambios */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	/**
	 * `YYYY-MM-DD` en hora LOCAL: `toISOString()` daría el día de UTC.
	 * @param {Date} d
	 */
	function fechaLocal(d) {
		const mes = String(d.getMonth() + 1).padStart(2, '0');
		const dia = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mes}-${dia}`;
	}

	/** Los tres atajos de rango, calcados de /movements. */
	const RANGOS = [
		{
			clave: 'semana',
			label: 'Esta semana',
			calcular: () => {
				const hoy = new Date();
				const lunes = new Date(hoy);
				lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
				return [fechaLocal(lunes), fechaLocal(hoy)];
			}
		},
		{
			clave: 'mes',
			label: 'Este mes',
			calcular: () => {
				const hoy = new Date();
				return [fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fechaLocal(hoy)];
			}
		},
		{
			clave: 'anio',
			label: 'Este año',
			calcular: () => {
				const hoy = new Date();
				return [fechaLocal(new Date(hoy.getFullYear(), 0, 1)), fechaLocal(hoy)];
			}
		}
	];

	/** @param {{ calcular: () => string[] }} rango */
	function aplicarRango(rango) {
		const [dateFrom, dateTo] = rango.calcular();
		irCon({ dateFrom, dateTo });
	}

	/** Cuál de los tres atajos coincide con el rango puesto, si alguno. */
	const rangoActivo = $derived(
		RANGOS.find((r) => {
			const [d, h] = r.calcular();
			return d === data.dateFrom && h === data.dateTo;
		})?.clave ?? ''
	);
</script>

<div class="herramientas">
	<div class="grupo">
		<a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
			<Icon name="back" size={18} />
		</a>
		<button
			type="button"
			class="grupo-btn"
			onclick={recargar}
			disabled={recargando}
			aria-label="Recargar la lista"
			title="Recargar la lista"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>
</div>

<section class="panel">
	<p class="page-intro">Registro de acciones críticas. Solo lectura — no se pueden editar ni eliminar entradas.</p>

	<div class="quick-range">
		<span class="quick-range-label">Rango rápido</span>
		<div class="grupo" role="group" aria-label="Rango rápido">
			{#each RANGOS as rango (rango.clave)}
				<button
					type="button"
					class="grupo-btn grupo-btn--texto"
					class:encendido={rangoActivo === rango.clave}
					aria-pressed={rangoActivo === rango.clave}
					onclick={() => aplicarRango(rango)}
				>
					{rango.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Auditoria no tiene estado de circulacion: es un registro de solo
	     lectura. Recibe la misma barra con sus propios filtros. -->
	<FilterBar
		search={{ name: 'action', placeholder: 'Acción exacta (ej. quote.approved)', value: data.action }}
		selects={[
			{
				name: 'entityType',
				label: 'Cualquier entidad',
				value: data.entityType,
				width: '11rem',
				options: [
					{ value: '', label: 'Cualquier entidad' },
					...data.entityTypes.map((entity) => ({ value: entity, label: entity }))
				]
			}
		]}
		dates={[
			{ name: 'dateFrom', label: 'Desde', value: data.dateFrom },
			{ name: 'dateTo', label: 'Hasta', value: data.dateTo }
		]}
	/>

	{#if data.logs.length === 0}
		<p class="empty-state">No hay registros de auditoría para los filtros seleccionados.</p>
	{:else}
		<table class="data-table data-table--acento">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Usuario</th>
					<th>Acción</th>
					<th>Entidad</th>
					<th>Descripción</th>
				</tr>
			</thead>
			<tbody>
				{#each data.logs as log (log.id)}
					<tr>
						<td>{formatDate(log.created_at)}</td>
						<td>{log.user_name || log.user_email || log.user_id || 'Sistema'}</td>
						<td><code>{log.action}</code></td>
						<td>{log.entity_type}{log.entity_id ? ` #${log.entity_id}` : ''}</td>
						<td>{log.description || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.page-intro {
		color: var(--muted);
		margin: 0 0 20px;
	}
	code {
		font-size: 0.85rem;
	}

	/* Calcado de /movements: el fondo hundido hace que el grupo de atajos "se
	   sienta" un control y no una fila más de filtros. */
	.quick-range {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-sunken);
		border-radius: var(--border-radius);
		margin-bottom: var(--sp-3);
	}

	.quick-range-label {
		font-size: var(--font-xs);
		color: var(--text-secondary);
		margin-right: var(--sp-1);
		white-space: nowrap;
	}
</style>
