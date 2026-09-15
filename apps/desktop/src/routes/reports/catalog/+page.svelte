<script>
  import { onMount } from 'svelte';
  import { formatMoney } from '@esr/core';
  import { Icon, PdfPreviewModal, downloadBlob } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';
  import { createCatalogReportRows, groupCatalogRows } from '@esr/reports/catalog';

  /**
   * Reportes › Catálogo de productos.
   *
   * Lista de precios por categoría/subcategoría, no un inventario: solo
   * artículos activos, sin ninguna columna de existencias. Gemela del
   * reporte de Catálogo en ESR Cloud.
   *
   * Sin repositorio: Desktop escribe su propio SQL, como el resto de sus
   * pantallas. El filtro es en memoria — Desktop ya carga todas las filas de
   * SQLite de una vez.
   */

  let allRows = [];
  let categorias = [];
  let busqueda = '';
  let categoriaId = '';
  let recargando = false;
  let generandoExcel = false;
  let generandoPdf = false;
  let error = '';

  let showPdfPreview = false;
  let pdfPreviewUrl = '';

  $: opcionesCategoria = [
    { value: '', label: 'Todas las categorías' },
    ...categorias.map((c) => ({ value: String(c.id), label: c.name }))
  ];

  $: filasFiltradas = allRows.filter((row) => {
    if (categoriaId && String(row.category_id ?? '') !== categoriaId) return false;
    if (!busqueda.trim()) return true;
    const q = busqueda.trim().toLowerCase();
    return (row.name || '').toLowerCase().includes(q) || (row.internal_code || '').toLowerCase().includes(q);
  });

  $: filasPantalla = createCatalogReportRows(filasFiltradas);
  $: grupos = groupCatalogRows(filasPantalla);

  async function cargar() {
    if (!window.api?.db) return;
    categorias = await window.api.db.get('SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name ASC');
    allRows = await window.api.db.get(`
      SELECT i.id, i.internal_code, i.name, i.rental_price, i.category_id, i.subcategory_id,
             c.name AS category_name, sc.name AS subcategory_name,
             COALESCE(u.abbr, u.name) AS uom_abbr
        FROM items i
        LEFT JOIN categories c ON c.id = i.category_id
        LEFT JOIN subcategories sc ON sc.id = i.subcategory_id
        LEFT JOIN units_of_measure u ON u.id = i.uom_id
       WHERE i.is_active = 1
       ORDER BY c.name, sc.name, i.name
    `);
  }

  async function recargar() {
    recargando = true;
    try {
      await cargar();
    } finally {
      recargando = false;
    }
  }

  onMount(cargar);

  async function abrirPdf() {
    if (generandoPdf) return;
    generandoPdf = true;
    error = '';
    try {
      const companyData = await window.api.db.get('SELECT * FROM company_info WHERE id = 1');
      const company = companyData?.[0] ?? null;
      const { generateCatalogPDF } = await import('@esr/reports/catalog');
      const { url } = generateCatalogPDF(grupos, 'preview', company);
      pdfPreviewUrl = url;
      showPdfPreview = true;
    } catch (e) {
      error = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
    } finally {
      generandoPdf = false;
    }
  }

  async function descargarExcel() {
    if (generandoExcel) return;
    generandoExcel = true;
    error = '';
    try {
      const { generateCatalogWorkbook } = await import('@esr/reports/catalog');
      const { blob, filename } = await generateCatalogWorkbook(filasPantalla);
      downloadBlob(blob, filename);
    } catch (e) {
      error = `No se pudo generar el Excel. ${e?.message ?? ''}`.trim();
    } finally {
      generandoExcel = false;
    }
  }
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/reports" aria-label="Volver a Reportes" title="Volver a Reportes">
      <Icon name="back" size={18} />
    </a>
    <button
      type="button"
      class="grupo-btn"
      on:click={recargar}
      disabled={recargando}
      aria-label="Recargar"
      title="Recargar"
    >
      <span class:girando={recargando}><Icon name="refresh" size={18} /></span>
    </button>
  </div>

  <div class="grupo">
    <button type="button" class="btn btn-secondary" on:click={descargarExcel} disabled={generandoExcel}>
      {generandoExcel ? 'Generando…' : 'Exportar Excel'}
    </button>
    <button type="button" class="btn btn-secondary" on:click={abrirPdf} disabled={generandoPdf}>
      {generandoPdf ? 'Generando…' : 'Vista previa PDF'}
    </button>
  </div>
</div>

<div class="record-header">
  <div class="record-titulo">
    <h1>Catálogo de productos</h1>
  </div>
</div>

<div class="card">
  {#if error}<div class="alert alert-danger">{error}</div>{/if}

  <p class="panel-hint">Solo artículos activos: es una lista de precios, no un inventario.</p>

  <FilterBar
    search={{ placeholder: 'Nombre o código…', value: busqueda }}
    onSearch={(v) => { busqueda = v; }}
  >
    <svelte:fragment slot="actions">
      <StatusSelect
        value={categoriaId}
        options={opcionesCategoria}
        label="Categoría"
        onchange={(e) => { categoriaId = e.currentTarget.value; }}
      />
    </svelte:fragment>
  </FilterBar>

  {#if grupos.length === 0}
    <p class="empty-state">Sin artículos activos para los filtros seleccionados.</p>
  {:else}
    <table class="data-table data-table--acento">
      <thead>
        <tr>
          <th>Código</th>
          <th>Ítem</th>
          <th>Unidad</th>
          <th>Precio de renta</th>
        </tr>
      </thead>
      <tbody>
        {#each grupos as cat (cat.categoryName)}
          <tr class="fila-grupo"><th colspan="4" scope="colgroup">{cat.categoryName}</th></tr>
          {#each cat.subcategories as sub (sub.subcategoryName)}
            <tr class="fila-subgrupo"><th colspan="4" scope="colgroup">{sub.subcategoryName}</th></tr>
            {#each sub.items as item (item.id)}
              <tr>
                <td>{item.code || '—'}</td>
                <td>{item.name}</td>
                <td>{item.uom}</td>
                <td>{formatMoney(item.price)}</td>
              </tr>
            {/each}
          {/each}
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<PdfPreviewModal
  bind:show={showPdfPreview}
  pdfUrl={pdfPreviewUrl}
  filename="Catalogo_de_productos.pdf"
  title="Vista previa del catálogo"
/>

<style>
  .record-header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-titulo {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .fila-grupo th {
    text-align: left;
    background: var(--surface-sunken);
    font-weight: 700;
  }

  .fila-subgrupo th {
    text-align: left;
    background: var(--surface);
    font-style: italic;
    color: var(--text-secondary);
  }
</style>
