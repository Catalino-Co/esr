<script>
  import { onMount } from 'svelte';
  import { Icon, downloadBlob } from '@esr/ui';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { unwrap } from '$lib/ipc';

  /**
   * Exportar / Importar catálogos.
   *
   * Lleva los 5 catálogos de Ajustes —tipos de evento, unidades de medida,
   * categorías, subcategorías y sectores comerciales— entre instalaciones
   * (esta Desktop y ESR Cloud) como un único archivo JSON.
   *
   * La EXPORTACION no tiene IPC propio: cada consulta es igual a la que ya
   * hace su pantalla de Ajustes, solo que trae activos E inactivos (no
   * archivados) y sin `id` — los ids no significan nada al otro lado.
   *
   * La IMPORTACION sí necesita `window.api.catalogs.import`: son varias filas
   * con chequeo de duplicados por entidad y deben quedar TODAS dentro o TODAS
   * fuera, algo que el renderer no puede garantizar llamando `window.api.db.run`
   * suelto. Ver `apps/desktop/electron/catalogs.cjs`.
   */

  const ENTIDADES = [
    {
      key: 'event_types',
      label: 'Tipos de evento',
      countSql: 'SELECT COUNT(*) AS n FROM event_types WHERE is_active IN (1,2)',
      listSql:
        'SELECT name, color, description, is_active FROM event_types WHERE is_active IN (1,2) ORDER BY name ASC'
    },
    {
      key: 'units_of_measure',
      label: 'Unidades de Medida',
      countSql: 'SELECT COUNT(*) AS n FROM units_of_measure WHERE is_active IN (1,2)',
      listSql:
        'SELECT name, abbr, is_active FROM units_of_measure WHERE is_active IN (1,2) ORDER BY name ASC'
    },
    {
      key: 'categories',
      label: 'Categorías',
      countSql: 'SELECT COUNT(*) AS n FROM categories WHERE is_active IN (1,2)',
      listSql: 'SELECT name, color, is_active FROM categories WHERE is_active IN (1,2) ORDER BY name ASC'
    },
    {
      key: 'subcategories',
      label: 'Subcategorías',
      countSql: 'SELECT COUNT(*) AS n FROM subcategories WHERE is_active IN (1,2)',
      listSql: `
        SELECT s.name, c.name AS category_name, s.is_active
          FROM subcategories s
          JOIN categories c ON c.id = s.category_id
         WHERE s.is_active IN (1,2)
         ORDER BY s.name ASC
      `
    },
    {
      key: 'commercial_sectors',
      label: 'Sectores comerciales',
      countSql: 'SELECT COUNT(*) AS n FROM commercial_sectors WHERE is_active IN (1,2)',
      listSql:
        'SELECT name, description, is_active FROM commercial_sectors WHERE is_active IN (1,2) ORDER BY name ASC'
    }
  ];

  const ETIQUETAS = Object.fromEntries(ENTIDADES.map((e) => [e.key, e.label]));

  // ── Exportar ──────────────────────────────────────────────────────────
  let conteos = {};
  let seleccionExport = Object.fromEntries(ENTIDADES.map((e) => [e.key, true]));
  let generandoExport = false;
  let errorExport = '';

  $: todosExportMarcados = ENTIDADES.every((e) => seleccionExport[e.key]);
  $: ningunaExportMarcada = ENTIDADES.every((e) => !seleccionExport[e.key]);

  function marcarTodosExport(valor) {
    const copia = { ...seleccionExport };
    for (const ent of ENTIDADES) copia[ent.key] = valor;
    seleccionExport = copia;
  }

  async function cargarConteos() {
    if (!window.api?.db) return;
    const nuevos = {};
    for (const ent of ENTIDADES) {
      const fila = await window.api.db.get(ent.countSql);
      nuevos[ent.key] = fila?.[0]?.n ?? 0;
    }
    conteos = nuevos;
  }

  onMount(cargarConteos);

  async function descargarCatalogos() {
    if (generandoExport || ningunaExportMarcada) return;
    generandoExport = true;
    errorExport = '';
    try {
      const catalogos = {};
      for (const ent of ENTIDADES) {
        if (!seleccionExport[ent.key]) continue;
        catalogos[ent.key] = await window.api.db.get(ent.listSql);
      }
      const payload = {
        tipo: 'esr-catalogos',
        version: 1,
        generado_en: new Date().toISOString(),
        origen: 'ESR Pro Desktop',
        catalogos
      };
      const fecha = new Date().toISOString().slice(0, 10);
      downloadBlob(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
        `catalogos-esr-${fecha}.json`
      );
    } catch (e) {
      errorExport = `No se pudo generar el archivo. ${e?.message ?? ''}`.trim();
    } finally {
      generandoExport = false;
    }
  }

  // ── Importar ──────────────────────────────────────────────────────────
  let archivoNombre = '';
  let parsed = null;
  let seleccionImport = {};
  let importando = false;
  let resultadoImport = null;

  $: clavesImport = parsed?.catalogos ? Object.keys(parsed.catalogos) : [];
  $: todosImportMarcados = clavesImport.length > 0 && clavesImport.every((k) => seleccionImport[k]);
  $: ningunaImportMarcada = clavesImport.length === 0 || clavesImport.every((k) => !seleccionImport[k]);

  function marcarTodosImport(valor) {
    const copia = { ...seleccionImport };
    for (const k of clavesImport) copia[k] = valor;
    seleccionImport = copia;
  }

  function onFileChange(event) {
    const file = event.target.files?.[0];
    // Permite volver a elegir el mismo archivo tras un error de lectura.
    event.target.value = '';
    if (!file) return;

    archivoNombre = file.name;
    resultadoImport = null;
    parsed = null;
    seleccionImport = {};

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (data?.tipo !== 'esr-catalogos') {
          throw new Error('El archivo elegido no es un catálogo de ESR Pro.');
        }
        if (!data.catalogos || typeof data.catalogos !== 'object') {
          throw new Error('El archivo no contiene catálogos.');
        }
        parsed = data;
        const marcadas = {};
        for (const key of Object.keys(parsed.catalogos)) marcadas[key] = true;
        seleccionImport = marcadas;
      } catch (err) {
        parsed = null;
        seleccionImport = {};
        dangerModal.show(err?.message || 'No se pudo leer el archivo. Verifique que sea un JSON válido.');
      }
    };
    reader.onerror = () => {
      dangerModal.show('No se pudo leer el archivo.');
    };
    reader.readAsText(file);
  }

  async function importar() {
    if (importando || !parsed || ningunaImportMarcada) return;
    importando = true;
    resultadoImport = null;
    try {
      const catalogosFiltrados = {};
      for (const key of clavesImport) {
        if (seleccionImport[key]) catalogosFiltrados[key] = parsed.catalogos[key];
      }
      resultadoImport = unwrap(await window.api.catalogs.import(catalogosFiltrados));
      await cargarConteos();
    } catch (err) {
      dangerModal.show(err.message);
    } finally {
      importando = false;
    }
  }
</script>

<div class="herramientas">
  <div class="titulo">
    <h1>Exportar / Importar catálogos</h1>
  </div>
  <div class="herramientas-datos">
    <div class="grupo">
      <a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
        <Icon name="back" size={18} />
      </a>
    </div>
  </div>
</div>

<div class="card">
  <div class="card-title">
    <span>Exportar catálogos</span>
  </div>
  <p class="panel-hint">
    Genera un archivo JSON con los catálogos elegidos, activos e inactivos (no archivados), para llevarlos a
    otra instalación de ESR Pro o a ESR Cloud.
  </p>

  <label class="casilla">
    <input
      type="checkbox"
      checked={todosExportMarcados}
      on:change={(e) => marcarTodosExport(e.currentTarget.checked)}
    />
    <span>Seleccionar todas</span>
  </label>

  <ul class="transfer-list">
    {#each ENTIDADES as ent (ent.key)}
      <li class="transfer-item">
        <label>
          <input type="checkbox" bind:checked={seleccionExport[ent.key]} />
          <span class="transfer-item-nombre">{ent.label}</span>
        </label>
        <span class="transfer-item-cuenta">{conteos[ent.key] ?? '…'}</span>
      </li>
    {/each}
  </ul>

  {#if errorExport}
    <div class="alert alert-danger">{errorExport}</div>
  {/if}

  <div class="acciones">
    <button
      type="button"
      class="btn btn-primary"
      disabled={generandoExport || ningunaExportMarcada}
      on:click={descargarCatalogos}
    >
      <Icon name="stock" size={16} />{generandoExport ? 'Generando…' : 'Descargar catálogos'}
    </button>
  </div>
</div>

<div class="card">
  <div class="card-title">
    <span>Importar catálogos</span>
  </div>
  <p class="panel-hint">
    Elija un archivo JSON generado por «Exportar catálogos» —de esta app o de ESR Cloud— para agregar sus
    filas a este equipo. Los nombres duplicados se omiten, nunca se sobrescriben.
  </p>

  <input type="file" accept="application/json" on:change={onFileChange} />

  {#if archivoNombre && !parsed}
    <p class="panel-hint">Archivo elegido: {archivoNombre}</p>
  {/if}

  {#if parsed}
    <p class="panel-hint">
      Archivo «{archivoNombre}», generado el {parsed.generado_en ?? '—'} desde {parsed.origen ?? '—'}.
    </p>

    <label class="casilla">
      <input
        type="checkbox"
        checked={todosImportMarcados}
        on:change={(e) => marcarTodosImport(e.currentTarget.checked)}
      />
      <span>Seleccionar todas</span>
    </label>

    <ul class="transfer-list">
      {#each clavesImport as key (key)}
        <li class="transfer-item">
          <label>
            <input type="checkbox" bind:checked={seleccionImport[key]} />
            <span class="transfer-item-nombre">{ETIQUETAS[key] ?? key}</span>
          </label>
          <span class="transfer-item-cuenta">{(parsed.catalogos[key] || []).length}</span>
        </li>
      {/each}
    </ul>

    <div class="acciones">
      <button
        type="button"
        class="btn btn-primary"
        disabled={importando || ningunaImportMarcada}
        on:click={importar}
      >
        <Icon name="check" size={16} />{importando ? 'Importando…' : 'Importar'}
      </button>
    </div>
  {/if}

  {#if resultadoImport}
    <div class="resultado">
      <div class="card-title" style="margin-top:20px;">
        <span>Resultado de la importación</span>
      </div>
      <ul class="resultado-list">
        {#each Object.keys(resultadoImport) as key (key)}
          {@const r = resultadoImport[key]}
          <li class="resultado-item">
            <span class="resultado-nombre">{ETIQUETAS[key] ?? key}</span>
            <span class="resultado-cifras">{r.agregados} agregados, {r.omitidos} omitidos</span>
            {#if r.errores?.length}
              <ul class="resultado-errores">
                {#each r.errores as msg}
                  <li>{msg}</li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .titulo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
  }

  .titulo h1 {
    margin: 0;
    font-size: var(--font-xl);
  }

  /* Fondo hundido + pastilla, igual que "Seleccionar todas"/"Solo stock bajo"
     en el resto de la app (ver "Nueva factura"). */
  .casilla {
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    margin: 12px 0;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-sunken);
    font-size: 0.9em;
    color: var(--text-muted);
    cursor: pointer;
  }

  .casilla input[type='checkbox'] {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
    cursor: pointer;
    flex-shrink: 0;
  }

  .transfer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    list-style: none;
  }

  .transfer-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  .transfer-item label {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
  }

  .transfer-item input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .transfer-item-nombre {
    font-size: 0.92rem;
  }

  .transfer-item-cuenta {
    min-width: 2.5rem;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-subtle);
    color: var(--accent-active);
    font-size: 0.78rem;
    font-weight: 700;
    text-align: center;
  }

  .acciones {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }

  .resultado-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    list-style: none;
  }

  .resultado-item {
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  .resultado-nombre {
    font-weight: 600;
    margin-right: 10px;
  }

  .resultado-cifras {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  .resultado-errores {
    margin: 6px 0 0 18px;
    color: var(--danger, #dc2626);
    font-size: 0.85rem;
  }
</style>
