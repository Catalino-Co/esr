<script>
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { Icon, Tabs } from '@esr/ui';
	import { dangerModal } from '$lib/stores/dangerModal';

	let { data, form } = $props();

	$effect(() => {
		if (form?.error) dangerModal.show(form.error);
	});

	const PESTAÑAS = [
		{ key: 'exportar', label: 'Exportar' },
		{ key: 'importar', label: 'Importar' }
	];
	let pestaña = $state('exportar');

	let recargando = $state(false);
	async function recargar() {
		recargando = true;
		try {
			await invalidateAll();
		} finally {
			recargando = false;
		}
	}

	const ENTITY_LABELS = {
		event_types: 'Tipos de evento',
		units_of_measure: 'Unidades de medida',
		categories: 'Categorías',
		subcategories: 'Subcategorías',
		commercial_sectors: 'Sectores comerciales'
	};

	// ── Exportar ────────────────────────────────────────────────────────────
	const ENTIDADES_EXPORT = [
		{ key: 'event_types', label: ENTITY_LABELS.event_types },
		{ key: 'units_of_measure', label: ENTITY_LABELS.units_of_measure },
		{ key: 'categories', label: ENTITY_LABELS.categories },
		{ key: 'subcategories', label: ENTITY_LABELS.subcategories },
		{ key: 'commercial_sectors', label: ENTITY_LABELS.commercial_sectors }
	];

	// Todas marcadas por defecto: lo normal es llevarse el catalogo entero.
	let exportElegidas = $state(new Set(ENTIDADES_EXPORT.map((e) => e.key)));
	const exportTodasMarcadas = $derived(exportElegidas.size === ENTIDADES_EXPORT.length);

	function alternarExport(clave) {
		const copia = new Set(exportElegidas);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		exportElegidas = copia;
	}

	function alternarExportTodas() {
		exportElegidas = exportTodasMarcadas ? new Set() : new Set(ENTIDADES_EXPORT.map((e) => e.key));
	}

	// ── Importar ────────────────────────────────────────────────────────────
	/** @type {HTMLInputElement} */
	let campoArchivo;
	/** Texto CRUDO del archivo, tal como se leyo: es lo que viaja al server. */
	let archivoTexto = $state('');
	let archivoNombre = $state('');
	let archivoError = $state('');
	/** @type {{ tipo?: string, catalogos?: Record<string, any[]> } | null} */
	let archivoParsed = $state(null);
	/** @type {Set<string>} */
	let importElegidas = $state(new Set());

	const entidadesArchivo = $derived(
		archivoParsed?.catalogos
			? Object.keys(archivoParsed.catalogos).filter((k) => Array.isArray(archivoParsed.catalogos[k]))
			: []
	);
	const importTodasMarcadas = $derived(
		entidadesArchivo.length > 0 && entidadesArchivo.every((k) => importElegidas.has(k))
	);

	function alternarImport(clave) {
		const copia = new Set(importElegidas);
		if (copia.has(clave)) copia.delete(clave);
		else copia.add(clave);
		importElegidas = copia;
	}

	function alternarImportTodas() {
		importElegidas = importTodasMarcadas ? new Set() : new Set(entidadesArchivo);
	}

	function limpiarArchivo() {
		archivoTexto = '';
		archivoNombre = '';
		archivoError = '';
		archivoParsed = null;
		importElegidas = new Set();
	}

	/** @param {Event & { currentTarget: HTMLInputElement }} evento */
	function alElegirArchivo(evento) {
		const archivo = evento.currentTarget.files?.[0];
		// Se limpia SIEMPRE: volver a elegir el MISMO archivo si no, no dispara
		// `change` y la pantalla parece colgada -mismo motivo que en el logotipo
		// de Datos de la empresa.
		evento.currentTarget.value = '';
		if (!archivo) return;

		limpiarArchivo();
		archivoNombre = archivo.name;

		const lector = new FileReader();
		lector.onload = () => {
			const texto = String(lector.result ?? '');
			let parsed;
			try {
				parsed = JSON.parse(texto);
			} catch {
				archivoError = 'El archivo no es un JSON válido.';
				return;
			}
			if (!parsed || parsed.tipo !== 'esr-catalogos' || typeof parsed.catalogos !== 'object' || !parsed.catalogos) {
				archivoError = 'El archivo no es un archivo de catálogos de ESR.';
				return;
			}
			archivoTexto = texto;
			archivoParsed = parsed;
			importElegidas = new Set(
				Object.keys(parsed.catalogos).filter((k) => Array.isArray(parsed.catalogos[k]))
			);
		};
		lector.onerror = () => {
			archivoError = 'No se pudo leer el archivo.';
		};
		lector.readAsText(archivo);
	}

	const alImportar = () => async ({ update, result }) => {
		await update({ reset: false });
		if (result.type === 'success') limpiarArchivo();
	};
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
			aria-label="Recargar"
			title="Recargar"
		>
			<span class:girando={recargando}><Icon name="refresh" size={18} /></span>
		</button>
	</div>
</div>

<section class="panel">
	<Tabs tabs={PESTAÑAS} bind:active={pestaña} />

	{#if pestaña === 'exportar'}
		<div role="tabpanel" id="panel-exportar" aria-labelledby="tab-exportar">
			<p class="panel-hint">
				Descarga un archivo JSON con los catálogos elegidos, listo para importarlo en otra instalación de
				ESR -Cloud o Desktop-.
			</p>

			<form method="GET" action="{page.url.pathname}/export" class="transfer-form">
				<div class="transfer-lista">
					<label class="transfer-item transfer-item--todas">
						<input type="checkbox" checked={exportTodasMarcadas} onchange={alternarExportTodas} />
						<span>Seleccionar todas</span>
					</label>
					{#each ENTIDADES_EXPORT as entidad (entidad.key)}
						<label class="transfer-item">
							<input
								type="checkbox"
								name="entities"
								value={entidad.key}
								checked={exportElegidas.has(entidad.key)}
								onchange={() => alternarExport(entidad.key)}
							/>
							<span>{entidad.label} ({data.counts[entidad.key]})</span>
						</label>
					{/each}
				</div>
				<div class="form-actions">
					<button type="submit" class="btn-primary" disabled={exportElegidas.size === 0}>
						<Icon name="stock" size={16} />Descargar catálogos
					</button>
				</div>
			</form>
		</div>
	{:else}
		<div role="tabpanel" id="panel-importar" aria-labelledby="tab-importar">
			<p class="panel-hint">
				Sube un archivo JSON exportado desde otra instalación de ESR. Lo que ya exista en esta empresa
				-comparando por nombre- se omite; solo se agrega lo nuevo.
			</p>

			<!-- Sin `name`: el archivo original nunca se serializa. Lo unico que viaja
			     es su texto, ya leido, en el campo oculto de mas abajo. -->
			<input bind:this={campoArchivo} type="file" accept="application/json" onchange={alElegirArchivo} hidden />

			<div class="transfer-archivo">
				<button type="button" class="btn-secondary" onclick={() => campoArchivo.click()}>
					{archivoNombre ? 'Elegir otro archivo' : 'Elegir archivo…'}
				</button>
				{#if archivoNombre}<span class="transfer-archivo-nombre">{archivoNombre}</span>{/if}
			</div>

			{#if archivoError}
				<div class="alert-error" role="alert">{archivoError}</div>
			{/if}

			{#if archivoParsed && entidadesArchivo.length > 0}
				<form method="POST" action="?/import" class="transfer-form" use:enhance={alImportar}>
					<input type="hidden" name="json_data" value={archivoTexto} />

					<div class="transfer-lista">
						<label class="transfer-item transfer-item--todas">
							<input type="checkbox" checked={importTodasMarcadas} onchange={alternarImportTodas} />
							<span>Seleccionar todas</span>
						</label>
						{#each entidadesArchivo as clave (clave)}
							<label class="transfer-item">
								<input
									type="checkbox"
									name="entities"
									value={clave}
									checked={importElegidas.has(clave)}
									onchange={() => alternarImport(clave)}
								/>
								<span>
									{ENTITY_LABELS[clave] ?? clave} ({archivoParsed.catalogos[clave].length} en el archivo)
								</span>
							</label>
						{/each}
					</div>

					<div class="form-actions">
						<button type="submit" class="btn-primary" disabled={importElegidas.size === 0}>
							<Icon name="check" size={16} />Importar
						</button>
					</div>
				</form>
			{/if}

			{#if form?.resultado}
				<div class="alert-success transfer-resumen" role="status">
					<div>
						<strong>Importación completada.</strong>
						<ul class="transfer-resumen-lista">
							{#each Object.entries(form.resultado) as [clave, parte] (clave)}
								<li>
									{ENTITY_LABELS[clave] ?? clave}: {parte.agregados} agregado(s), {parte.omitidos} omitido(s).
									{#if parte.errores.length}
										<ul class="transfer-errores">
											{#each parte.errores as err (err)}
												<li>{err}</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.transfer-form {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.transfer-lista {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: var(--sp-2);
	}

	.transfer-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--border-radius-sm);
		background: var(--bg-surface);
		font-size: var(--font-sm);
		cursor: pointer;
	}

	.transfer-item--todas {
		font-weight: 600;
		border-style: dashed;
	}

	.transfer-archivo {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.transfer-archivo-nombre {
		font-size: var(--font-sm);
		color: var(--text-secondary);
	}

	.transfer-resumen {
		margin-top: var(--sp-4);
		align-items: flex-start;
	}

	.transfer-resumen-lista {
		margin: var(--sp-2) 0 0;
		padding-left: 1.2rem;
	}

	.transfer-errores {
		margin: var(--sp-1) 0 0;
		padding-left: 1.2rem;
		color: var(--text-secondary);
		font-size: var(--font-xs);
	}
</style>
