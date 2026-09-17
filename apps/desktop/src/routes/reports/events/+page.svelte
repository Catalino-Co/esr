<script>
  import { onMount } from 'svelte';
  import {
    PERIODOS,
    PERIODO_LABELS,
    formatDateAbsolute,
    parsePeriodo,
    periodoDeRango,
    rangoDelPeriodo,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import { EventCalendar, Icon, PdfPreviewModal, downloadBlob } from '@esr/ui';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  /**
   * Reportes › Eventos por fecha.
   *
   * Gemelo del reporte de Eventos de ESR Cloud, con el mismo interruptor
   * Tabla/Calendario que ya usa /events en las dos apps. Sin repositorio:
   * Desktop escribe su propio SQL y filtra en memoria, como el resto de sus
   * pantallas. Solo lectura: sin alta ni edición, esas viven en /events.
   */

  const ESTADOS = [
    { value: '', label: 'Cualquier estado' },
    { value: 'tentativo', label: 'Tentativo' },
    { value: 'confirmado', label: 'Confirmado' },
    { value: 'completado', label: 'Completado' },
    { value: 'cancelado', label: 'Cancelado' }
  ];

  let events = [];
  let eventTypes = [];
  let company = null;

  let estado = '';
  let busqueda = '';
  let calendario = false;
  let recargando = false;
  let generandoPdf = false;
  let generandoExcel = false;
  let error = '';

  let showPdfPreview = false;
  let pdfPreviewUrl = '';

  /* La ventana de fechas. Filtra EN MEMORIA sobre lo ya cargado, igual que
     /events: esta pantalla ya trae todos los eventos activos de una vez. */
  let desde = '';
  let hasta = '';
  $: rangoActivo = periodoDeRango(desde, hasta);

  async function loadEvents() {
    if (!window.api?.db) return;
    events = await window.api.db.get(`
      SELECT e.*, c.name as client_name
      FROM events e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.is_active = 1
      ORDER BY e.date DESC
    `);
  }

  async function loadCatalogos() {
    if (!window.api?.db) return;
    const [tipos, companyRows] = await Promise.all([
      window.api.db.get('SELECT id, name, color FROM event_types WHERE is_active = 1 ORDER BY name ASC'),
      window.api.db.get('SELECT * FROM company_info WHERE id = 1')
    ]);
    eventTypes = tipos;
    company = companyRows?.[0] ?? null;
  }

  function aplicarPeriodo(periodo) {
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
  }

  onMount(async () => {
    // El rango por defecto sale del ajuste de empresa, igual que /events.
    let periodo = 'mes';
    try {
      const fila = await window.api?.settings?.getCompany?.();
      periodo = parsePeriodo(fila?.default_event_range);
    } catch {
      /* sin puente: queda el mes, que es el valor por defecto */
    }
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    await Promise.all([loadEvents(), loadCatalogos()]);
  });

  async function recargar() {
    recargando = true;
    try {
      await Promise.all([loadEvents(), loadCatalogos()]);
    } finally {
      recargando = false;
    }
  }

  /**
   * `base` es lo que ve el Calendario: estado y texto, SIN fecha. Pagina de
   * mes en mes en memoria y perdería un mes entero si solo viera lo que la
   * Tabla tiene cargado. `visiblesTabla` añade la ventana de fechas encima.
   */
  $: termino = busqueda.trim().toLowerCase();
  $: base = events.filter((e) => {
    if (estado && e.status !== estado) return false;
    if (!termino) return true;
    return [e.name, e.client_name, e.location].some((v) =>
      (v ?? '').toLowerCase().includes(termino)
    );
  });
  $: visiblesTabla = base.filter((e) => {
    if (desde && e.date && e.date < desde) return false;
    if (hasta && e.date && e.date > hasta) return false;
    return true;
  });

  /* El Calendario excluye cancelados SIEMPRE, sin importar el desplegable de
     estado: una reserva cancelada ya no ocupa el día. La Tabla/PDF/Excel
     (visiblesTabla) siguen viendo `base` sin este filtro. */
  $: baseCalendario = base.filter((e) => e.status !== 'cancelado');

  /** El color del tipo, resuelto POR NOMBRE. Mismo criterio que /events. */
  const GRIS = '#94a3b8';
  $: colores = new Map(eventTypes.map((t) => [String(t.name).trim().toLowerCase(), t.color]));
  $: colorDe = (ev) => colores.get(String(ev?.event_type ?? '').trim().toLowerCase()) || GRIS;

  async function abrirPdf() {
    if (generandoPdf) return;
    generandoPdf = true;
    error = '';
    try {
      const { generateEventsReportPDF } = await import('@esr/reports/events');
      const { url } = generateEventsReportPDF(visiblesTabla, 'preview', company);
      pdfPreviewUrl = url;
      showPdfPreview = true;
    } catch (e) {
      error = `No se pudo generar el PDF. ${e?.message ?? ''}`.trim();
    } finally {
      generandoPdf = false;
    }
  }

  // En reportes se exporta a Excel y PDF, nunca CSV -ver memoria
  // `reports-exportan-excel-pdf`. Mismo patrón que `reports/catalog`.
  async function exportarExcel() {
    if (generandoExcel) return;
    generandoExcel = true;
    error = '';
    try {
      const { generateEventsWorkbook } = await import('@esr/reports/events');
      const { blob, filename } = await generateEventsWorkbook(visiblesTabla);
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
    <button
      type="button"
      class="grupo-btn"
      class:encendido={calendario}
      aria-pressed={calendario}
      aria-label={calendario ? 'Ver como tabla' : 'Ver como calendario'}
      title={calendario ? 'Ver como tabla' : 'Ver como calendario'}
      on:click={() => (calendario = !calendario)}
    >
      <Icon name="calendar" size={18} />
    </button>
  </div>

  <div class="herramientas-datos">
    {#if !calendario}
      <div class="grupo" role="group" aria-label="Rango rápido">
        {#each PERIODOS as periodo (periodo)}
          <button
            type="button"
            class="grupo-btn grupo-btn--texto"
            class:encendido={rangoActivo === periodo}
            aria-pressed={rangoActivo === periodo}
            on:click={() => aplicarPeriodo(periodo)}
          >
            {PERIODO_LABELS[periodo]}
          </button>
        {/each}
      </div>
    {/if}

    <StatusSelect
      value={estado}
      options={ESTADOS}
      label="Estado del evento"
      onchange={(e) => (estado = e.currentTarget.value)}
    />
    <button type="button" class="btn btn-secondary" on:click={exportarExcel} disabled={generandoExcel}>
      {generandoExcel ? 'Generando…' : 'Exportar Excel'}
    </button>
    <button type="button" class="btn btn-primary" on:click={abrirPdf} disabled={generandoPdf}>
      {generandoPdf ? 'Generando…' : 'Vista previa PDF'}
    </button>
  </div>
</div>

<div class="card">
  {#if error}<div class="alert alert-danger">{error}</div>{/if}

  <div class="filters">
    {#if !calendario}
      <div class="filters-control filters-control--date">
        <input type="date" bind:value={desde} aria-label="Desde" title="Desde" />
      </div>
      <div class="filters-control filters-control--date">
        <input type="date" bind:value={hasta} aria-label="Hasta" title="Hasta" />
      </div>
    {/if}

    <div class="filters-search">
      <span class="filters-search-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <input
        type="search"
        bind:value={busqueda}
        placeholder="Nombre, cliente o lugar"
        aria-label="Buscar en la tabla"
      />
    </div>

    <button
      type="button"
      class="filters-btn filters-btn--sm"
      disabled={!busqueda}
      on:click={() => (busqueda = '')}
      aria-label="Limpiar la búsqueda"
      title="Limpiar la búsqueda"
    >
      <Icon name="x" size={14} />
    </button>
  </div>

  {#if !calendario}
    <p class="rango">
      {#if desde && hasta}
        Eventos del {formatDateAbsolute(desde)} al {formatDateAbsolute(hasta)}
      {:else if desde}
        Eventos desde el {formatDateAbsolute(desde)}
      {:else if hasta}
        Eventos hasta el {formatDateAbsolute(hasta)}
      {:else}
        Todos los eventos
      {/if}
      · {visiblesTabla.length} {visiblesTabla.length === 1 ? 'resultado' : 'resultados'}
    </p>
  {/if}

  {#if calendario}
    <EventCalendar events={baseCalendario} colorOf={colorDe} />
  {:else}
    <div class="table-wrapper">
      <table class="table table--acento">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Evento</th>
            <th>Cliente</th>
            <th>Lugar</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {#each visiblesTabla as ev (ev.id)}
            <tr>
              <td class="fecha" style="border-left-color: {colorDe(ev)}">{ev.date || '—'}</td>
              <td>
                <span class="nombre">{ev.name}</span>
                {#if ev.event_type}
                  <span class="tipo">
                    <span class="punto" style="background: {colorDe(ev)}"></span>
                    {ev.event_type}
                  </span>
                {/if}
              </td>
              <td>{ev.client_name || '—'}</td>
              <td>{ev.location || '—'}</td>
              <td>
                <span class="badge {statusBadgeClass(ev.status)}">{statusLabel(ev.status)}</span>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5">
                <p class="empty-state">
                  {termino || estado
                    ? 'Ningún evento coincide con el filtro.'
                    : 'Ningún evento en este rango de fechas.'}
                </p>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<PdfPreviewModal
  bind:show={showPdfPreview}
  pdfUrl={pdfPreviewUrl}
  filename="Eventos.pdf"
  title="Vista previa de eventos"
/>

<style>
  .fecha {
    border-left: 3px solid transparent;
    padding-left: var(--sp-3);
    font-weight: 500;
    white-space: nowrap;
  }

  .nombre {
    display: block;
    font-weight: 600;
  }

  .tipo {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .punto {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .rango {
    margin: 0 0 var(--sp-3);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }
</style>
