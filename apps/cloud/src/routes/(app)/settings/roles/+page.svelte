<script>
	let { data } = $props();

	const extrasPorRol = $derived(Object.fromEntries(data.extras.map((e) => [e.role, e])));
</script>

<section class="panel">
	<p class="panel-hint">
		Los roles son fijos: se asignan en <a href="/settings/users">Usuarios</a>, pero no se crean ni
		se editan. Cada rol incluye todo lo del anterior y añade lo suyo.
	</p>

	<div class="fichas">
		{#each data.roles as rol (rol.role)}
			{@const extra = extrasPorRol[rol.role]}
			<article class="ficha">
				<header class="ficha-cabecera">
					<h2>{rol.label}</h2>
					<span class="badge badge-muted">{rol.total} permisos</span>
				</header>
				<p class="ficha-desc">{rol.description}</p>

				{#if extra.nuevos.length === 0}
					<p class="ficha-nota">Mismos permisos que {extra.sobre}.</p>
				{:else}
					<p class="ficha-nota">
						{#if extra.sobre}Además de todo lo de {extra.sobre}, puede:{:else}Puede:{/if}
					</p>
					<ul class="ficha-lista">
						{#each extra.nuevos as permiso (permiso)}
							<li>{permiso}</li>
						{/each}
					</ul>
				{/if}
			</article>
		{/each}
	</div>
</section>

<section class="panel">
	<h2 class="sec-title">Matriz completa</h2>
	<p class="panel-hint">
		Sale de la misma constante que autoriza de verdad, así que no puede desviarse de lo que hace la
		aplicación.
	</p>

	<div class="matriz-scroll">
		<table class="data-table matriz">
			<thead>
				<tr>
					<th class="col-permiso">Permiso</th>
					{#each data.roles as rol (rol.role)}
						<th class="col-rol">{rol.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.grupos as grupo (grupo.label)}
					<tr class="fila-grupo">
						<th colspan={data.roles.length + 1} scope="colgroup">{grupo.label}</th>
					</tr>
					{#each grupo.permisos as permiso (permiso.permission)}
						<tr>
							<td class="col-permiso">{permiso.label}</td>
							{#each permiso.concedido as concedido, i (data.roles[i].role)}
								<td class="col-rol">
									<!-- El simbolo es decorativo: el texto accesible lo da el title. -->
									<span
										class="marca"
										class:si={concedido}
										title={`${data.roles[i].label}: ${concedido ? 'sí' : 'no'}`}
									>
										<span aria-hidden="true">{concedido ? '●' : '·'}</span>
										<span class="visually-hidden">{concedido ? 'sí' : 'no'}</span>
									</span>
								</td>
							{/each}
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.fichas {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: var(--sp-4);
	}

	.ficha {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--sp-4);
		background: var(--surface-sunken);
	}

	.ficha-cabecera {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin-bottom: var(--sp-2);
	}

	.ficha-cabecera h2 {
		margin: 0;
		font-size: var(--font-md);
	}

	.ficha-desc {
		margin: 0 0 var(--sp-3);
		font-size: var(--font-sm);
		color: var(--text-secondary);
		line-height: 1.5;
	}

	/* Color explicito: `app.css` pinta todo `<p>` con --text-muted, que sobre
	   el fondo hundido de la ficha se queda en 4.34:1. */
	.ficha-nota {
		margin: 0 0 var(--sp-2);
		font-size: var(--font-sm);
		font-weight: 600;
		color: var(--text-primary);
	}

	.ficha-lista {
		margin: 0;
		padding-left: 1.1rem;
		font-size: var(--font-sm);
		color: var(--text-secondary);
		line-height: 1.6;
	}

	.sec-title {
		margin: 0 0 var(--sp-2);
		font-size: var(--font-md);
	}

	/* La matriz es ancha por naturaleza: scrollea ella, nunca la pagina. */
	.matriz-scroll {
		overflow-x: auto;
	}

	.matriz {
		min-width: 640px;
	}

	.col-permiso {
		text-align: left;
		white-space: nowrap;
	}

	.col-rol {
		text-align: center;
		width: 1%;
		white-space: nowrap;
	}

	.fila-grupo th {
		text-align: left;
		background: var(--surface-sunken);
		font-size: var(--font-sm);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
	}

	.marca {
		color: var(--text-placeholder);
		font-size: 1rem;
	}

	.marca.si {
		color: var(--success-text);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
