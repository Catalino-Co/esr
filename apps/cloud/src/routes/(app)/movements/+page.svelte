<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatNumber, statusLabel } from '@esr/core';

	let { data } = $props();

	/**
	 * Los tipos que se ofrecen, en dos familias.
	 *
	 * Conviven a propósito: las MANUALES las escribe la pantalla de Inventario y
	 * las OPERATIVAS llevan escribiéndolas conduces y órdenes desde antes.
	 * Separarlas sería mentir sobre por qué se movió el stock — al almacenero le
	 * da igual quién lo escribió, quiere saber qué entró y qué salió. Las
	 * etiquetas salen de `statusLabel`, que ya traduce los dos vocabularios.
	 *
	 * Pero guardan cosas distintas en `quantity`: las manuales, un DELTA con
	 * signo; las operativas, una magnitud, porque quien las escribe no lleva esa
	 * convención. Por eso el signo y el color solo se pintan en las primeras: un
	 * «Entregado +1» se leería como si el stock hubiera SUBIDO al entregar, que
	 * es lo contrario de lo que pasó.
	 */
	const MANUALES = ['entrada', 'salida', 'ajuste'];

	const TIPOS = [
		{ grupo: 'Manuales', valores: MANUALES },
		{
			grupo: 'Operativos',
			valores: [
				'delivered',
				'returned',
				'damaged',
				'lost',
				'reverso_delivered',
				'reverso_returned',
				'reverso_damaged',
				'reverso_lost'
			]
		}
	];

	/** `YYYY-MM-DD` en hora LOCAL: `toISOString()` daría el día de UTC. */
	function fechaLocal(d) {
		const mes = String(d.getMonth() + 1).padStart(2, '0');
		const dia = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${mes}-${dia}`;
	}

	/**
	 * Los tres atajos de rango.
	 *
	 * «Esta semana» empieza en LUNES: `getDay()` devuelve 0 para el domingo, así
	 * que un `- getDay()` a secas daría la semana del domingo, que no es la
	 * semana laboral de nadie aquí.
	 */
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

	/** Navega conservando el resto de la query: los filtros no se pierden. */
	function irCon(cambios) {
		const url = new URL(page.url);
		for (const [clave, valor] of Object.entries(cambios)) {
			if (valor === null || valor === '') url.searchParams.delete(clave);
			else url.searchParams.set(clave, String(valor));
		}
		goto(url, { replaceState: true, noScroll: true, invalidateAll: true });
	}

	function aplicarRango(rango) {
		const [desde, hasta] = rango.calcular();
		irCon({ desde, hasta });
	}

	/** Cuál de los tres atajos coincide con el rango puesto, si alguno. */
	const rangoActivo = $derived(
		RANGOS.find((r) => {
			const [desde, hasta] = r.calcular();
			return desde === data.from && hasta === data.to;
		})?.clave ?? ''
	);

	/**
	 * `created_at` llega como `Date` o como cadena ISO según el driver. Se parte
	 * en fecha y hora porque son dos columnas distintas: la fecha agrupa, la hora
	 * ordena dentro del día.
	 */
	function partirMomento(valor) {
		const d = new Date(valor);
		if (Number.isNaN(d.getTime())) return { fecha: '—', hora: '—' };
		return {
			fecha: fechaLocal(d),
			hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
		};
	}
</script>

<section class="panel">
	{#if data.item}
		<div class="filtro-articulo">
			<span>
				Historial de <strong>{data.item.name}</strong>
				{#if data.item.internal_code}<span class="codigo">{data.item.internal_code}</span>{/if}
			</span>
			<!-- Quitar el filtro es lo que convierte esta pantalla en el diario del
			     almacén entero, que es la mitad de para qué sirve. -->
			<button type="button" class="btn-link" onclick={() => irCon({ item: null })}>
				Ver todos los movimientos
			</button>
		</div>
	{/if}

	<div class="filtros">
		<div class="quick-range">
			<span class="quick-range-label">Rango rápido</span>
			{#each RANGOS as rango (rango.clave)}
				<button
					type="button"
					class="btn-secondary btn-sm"
					class:activo={rangoActivo === rango.clave}
					onclick={() => aplicarRango(rango)}
				>
					{rango.label}
				</button>
			{/each}
		</div>

		<div class="campos">
			<label class="campo">
				<span>Desde</span>
				<input type="date" value={data.from} onchange={(e) => irCon({ desde: e.currentTarget.value })} />
			</label>
			<label class="campo">
				<span>Hasta</span>
				<input type="date" value={data.to} onchange={(e) => irCon({ hasta: e.currentTarget.value })} />
			</label>
			<label class="campo">
				<span>Almacén</span>
				<select value={data.warehouseId} onchange={(e) => irCon({ almacen: e.currentTarget.value })}>
					<option value="">Todos</option>
					{#each data.warehouses as almacen (almacen.id)}
						<option value={String(almacen.id)}>{almacen.name}</option>
					{/each}
				</select>
			</label>
			<label class="campo">
				<span>Tipo</span>
				<select value={data.type} onchange={(e) => irCon({ tipo: e.currentTarget.value })}>
					<option value="">Todos</option>
					{#each TIPOS as familia (familia.grupo)}
						<optgroup label={familia.grupo}>
							{#each familia.valores as tipo (tipo)}
								<option value={tipo}>{statusLabel(tipo)}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</label>
		</div>
	</div>

	{#if data.movements.length === 0}
		<p class="empty-state">No hay movimientos en el rango elegido.</p>
	{:else}
		<table class="data-table">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Hora</th>
					<th>Ítem</th>
					<th>Almacén</th>
					<th>Tipo</th>
					<th>Responsable</th>
					<th class="num">Cantidad</th>
					<th>Observaciones</th>
				</tr>
			</thead>
			<tbody>
				{#each data.movements as mov (mov.id)}
					{@const momento = partirMomento(mov.created_at)}
					{@const conSigno = MANUALES.includes(mov.type)}
					<tr>
						<td class="momento">{momento.fecha}</td>
						<td class="momento">{momento.hora}</td>
						<td>
							{mov.item_name || '—'}
							{#if mov.item_code}<span class="codigo">{mov.item_code}</span>{/if}
						</td>
						<td>{mov.warehouse_name || '—'}</td>
						<td>{statusLabel(mov.type)}</td>
						<!-- Los movimientos anteriores a esta reforma no guardaban quién:
						     «Sistema» lo dice, inventar un responsable sería peor. -->
						<td>{mov.user_name || 'Sistema'}</td>
						<td
							class="num"
							class:entra={conSigno && mov.quantity > 0}
							class:sale={conSigno && mov.quantity < 0}
						>
							{conSigno && mov.quantity > 0 ? '+' : ''}{formatNumber(mov.quantity)}
						</td>
						<td class="notas">{mov.notes || '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.filtro-articulo {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding: var(--sp-3) var(--sp-4);
		margin-bottom: var(--sp-4);
		background: var(--surface-sunken);
		border-radius: var(--border-radius);
		font-size: var(--font-sm);
	}

	.filtros {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.quick-range {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	/* Sentence case, sin mayúsculas ni `letter-spacing`: es la regla 5 del
	   sistema. Lo que la distingue de los botones es el tamaño y el color. */
	.quick-range-label {
		font-size: var(--font-xs);
		color: var(--text-secondary);
		margin-right: var(--sp-1);
	}

	/* El atajo puesto se marca con el borde, no con el color de acento: eso está
	   reservado a la acción primaria de la pantalla. */
	.activo {
		border-color: var(--border-focus);
		font-weight: 600;
	}

	.campos {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.campo {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--font-xs);
		color: var(--text-secondary);
	}

	.campo input,
	.campo select {
		height: var(--h-control);
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--text-primary);
		font-size: var(--font-sm);
	}

	.campo input:focus-visible,
	.campo select:focus-visible {
		outline: none;
		border-color: var(--border-focus);
		box-shadow: var(--focus-ring);
	}

	.codigo {
		font-size: var(--font-xs);
		color: var(--text-secondary);
		margin-left: var(--sp-2);
	}

	.num {
		text-align: right;
		white-space: nowrap;
		font-weight: 600;
	}

	/* Una fecha partida en dos líneas —«2026-08-» / «30»— se lee fatal en una
	   tabla que se recorre de arriba abajo. */
	.momento {
		white-space: nowrap;
	}

	.entra {
		color: var(--success-text);
	}

	.sale {
		color: var(--danger-text);
	}

	.notas {
		color: var(--text-secondary);
		font-size: var(--font-sm);
	}
</style>
