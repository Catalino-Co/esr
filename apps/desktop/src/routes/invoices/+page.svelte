<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt } from '@esr/reports';
  import { unwrapOr } from '$lib/ipc';
  import { Icon, Modal } from '@esr/ui';
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
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  /**
   * Facturas de ESR Pro.
   *
   * Mismo Quick range/rango de fechas/buscar-por-número que ganaron Órdenes y
   * Cotizaciones, con una diferencia: esta pantalla YA pasaba por
   * `SqliteInvoiceRepository` vía `window.api.invoices.*` (a diferencia de
   * Cotizaciones, que hace SQL crudo en el propio archivo), así que sigue por
   * ese camino: se le añadieron `date_from`/`date_to` y `searchByNumber` al
   * repositorio y a su puente IPC, en vez de reescribir esta pantalla a SQL
   * crudo.
   *
   * El eje de circulación (Activas/Inactivas/Archivadas) se retira del
   * listado, igual que ya se hizo con Cotizaciones y Órdenes: una factura se
   * retira ANULÁNDOLA, que es su estado de negocio. Sin `state` en la
   * llamada, `SqliteInvoiceRepository.list()` cae en su propio valor por
   * defecto (activas).
   */

  const ESTADOS = [
    { value: '', label: 'Cualquier estado' },
    { value: 'emitida', label: 'Emitida' },
    { value: 'anulada', label: 'Anulada' }
  ];

  let statusFilter = '';
  let search = '';
  let invoices = [];
  let recargando = false;

  /* La ventana de fechas. Va en la llamada al repositorio, no en memoria: es
     lo que decide CUANTAS filas se traen. */
  let desde = '';
  let hasta = '';
  $: rangoActivo = periodoDeRango(desde, hasta);

  async function loadInvoices() {
    if (!window.api?.invoices) return;
    invoices = unwrapOr(
      await window.api.invoices.list({
        status: statusFilter || undefined,
        search: search.trim() || undefined,
        date_from: desde || undefined,
        date_to: hasta || undefined
      }),
      []
    );
  }

  function aplicarPeriodo(periodo) {
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    loadInvoices();
  }

  onMount(async () => {
    // El rango por defecto sale del ajuste de empresa. Aqui NO viaja en la
    // URL: los filtros de Desktop viven en la pantalla.
    let periodo = 'mes';
    try {
      const fila = await window.api?.settings?.getCompany?.();
      periodo = parsePeriodo(fila?.default_invoice_range);
    } catch {
      /* sin puente: queda el mes, que es el valor por defecto */
    }
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    await loadInvoices();
  });

  async function recargar() {
    recargando = true;
    try {
      await loadInvoices();
    } finally {
      recargando = false;
    }
  }

  /**
   * Una factura anulada no tiene saldo: no se debe nada porque el documento ya
   * no existe a efectos de cobro. Devolver 0 lo pintaria como «saldada», que
   * diria que se cobro.
   */
  function saldo(inv) {
    if (inv.status === 'anulada') return null;
    const pendiente = Number(inv.total || 0) - Number(inv.paid || 0);
    return pendiente > 0 ? pendiente : 0;
  }

  function vencida(inv) {
    if (inv.status === 'anulada' || !inv.due_date) return false;
    return saldo(inv) > 0 && inv.due_date < new Date().toISOString().slice(0, 10);
  }

  /* ── Buscar una factura por su número ───────────────────────────────────
   * Va contra TODA la base, sin ventana de fechas ni `is_active`: si se busca
   * por número es porque se sabe cuál es, y una anulada tiene que aparecer.
   * `invoice_number` es NOT NULL en las dos bases.
   */
  let buscandoPorNumero = false;
  let consultaNumero = '';
  let resultadosNumero = [];
  let elegidaNumero = -1;

  function abrirBuscadorNumero() {
    consultaNumero = '';
    resultadosNumero = [];
    elegidaNumero = -1;
    buscandoPorNumero = true;
  }

  let temporizadorNumero = null;
  function alTeclearNumero() {
    elegidaNumero = -1;
    clearTimeout(temporizadorNumero);
    temporizadorNumero = setTimeout(buscarPorNumero, 250);
  }

  async function buscarPorNumero() {
    const termino = consultaNumero.trim();
    if (termino.length < 1 || !window.api?.invoices?.searchByNumber) {
      resultadosNumero = [];
      return;
    }
    resultadosNumero = unwrapOr(await window.api.invoices.searchByNumber(termino, 10), []);
    elegidaNumero = resultadosNumero.length > 0 ? 0 : -1;
  }

  function alPulsarNumero(evento) {
    if (resultadosNumero.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      elegidaNumero = (elegidaNumero + 1) % resultadosNumero.length;
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      elegidaNumero = (elegidaNumero - 1 + resultadosNumero.length) % resultadosNumero.length;
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      abrirElegidaNumero();
    }
  }

  function abrirElegidaNumero() {
    const factura = resultadosNumero[elegidaNumero];
    if (!factura) return;
    buscandoPorNumero = false;
    goto(`/invoices/detail?id=${factura.id}`);
  }
</script>

<!--
  Las herramientas van FUERA de la tarjeta y el contenido dentro: navegar la
  pantalla es un trabajo distinto de filtrar sus datos. Mismas clases que
  Cotizaciones y Órdenes.
-->
<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/" aria-label="Volver al inicio" title="Volver al inicio">
      <Icon name="back" size={18} />
    </a>
    <button
      type="button"
      class="grupo-btn"
      on:click={recargar}
      disabled={recargando}
      aria-label="Recargar la lista"
      title="Recargar la lista"
    >
      <span class:girando={recargando}><Icon name="refresh" size={18} /></span>
    </button>
    <button
      type="button"
      class="grupo-btn"
      on:click={abrirBuscadorNumero}
      aria-label="Buscar una factura por su número"
      title="Buscar una factura por su número"
    >
      <Icon name="search" size={18} />
    </button>
  </div>

  <div class="herramientas-datos">
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

    <StatusSelect
      value={statusFilter}
      options={ESTADOS}
      label="Estado de la factura"
      onchange={(e) => { statusFilter = e.currentTarget.value; loadInvoices(); }}
    />
    <button class="btn btn-primary" on:click={() => goto('/invoices/new')}>+ Nueva Factura</button>
  </div>
</div>

<div class="card">
  <!-- Fila propia y no FilterBar: aqui el orden es fechas -> boton Buscar ->
       buscador, con aplicacion explicita en las fechas. Calcado de Ordenes y
       Cotizaciones. -->
  <div class="filters">
    <div class="filters-control filters-control--date">
      <input type="date" bind:value={desde} aria-label="Desde" title="Desde" />
    </div>
    <div class="filters-control filters-control--date">
      <input type="date" bind:value={hasta} aria-label="Hasta" title="Hasta" />
    </div>
    <button
      type="button"
      class="filters-btn"
      on:click={loadInvoices}
      aria-label="Buscar en el rango"
      title="Buscar en el rango"
    >
      <Icon name="search" size={16} />
    </button>

    <div class="filters-search">
      <span class="filters-search-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <input
        type="search"
        bind:value={search}
        on:input={loadInvoices}
        placeholder="Número o cliente"
        aria-label="Buscar en la tabla"
      />
    </div>

    <button
      type="button"
      class="filters-btn filters-btn--sm"
      disabled={!search}
      on:click={() => { search = ''; loadInvoices(); }}
      aria-label="Limpiar la búsqueda"
      title="Limpiar la búsqueda"
    >
      <Icon name="x" size={14} />
    </button>
  </div>

  <p class="rango">
    {#if desde && hasta}
      Facturas del {formatDateAbsolute(desde)} al {formatDateAbsolute(hasta)}
    {:else if desde}
      Facturas desde el {formatDateAbsolute(desde)}
    {:else if hasta}
      Facturas hasta el {formatDateAbsolute(hasta)}
    {:else}
      Todas las facturas
    {/if}
    · {invoices.length} {invoices.length === 1 ? 'resultado' : 'resultados'}
  </p>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Factura #</th>
          <th>Cliente</th>
          <th>WO Referencia</th>
          <th>Fecha</th>
          <th>Vence</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:right;">Cobrado</th>
          <th style="text-align:right;">Saldo</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each invoices as inv}
          <tr>
            <td style="font-weight:600;color:var(--accent-active);">{inv.invoice_number}</td>
            <td style="font-weight:500;">{inv.client_name || '—'}</td>
            <td style="color:var(--text-muted);">
              {inv.work_order_id ? `WO-${String(inv.work_order_id).padStart(5, '0')}` : '—'}
            </td>
            <td>{inv.date || '—'}</td>
            <td class:vencida={vencida(inv)} style="color:var(--text-muted);">
              {inv.due_date || '—'}{#if vencida(inv)} ⚠{/if}
            </td>
            <td style="text-align:right;font-weight:700;">${fmt(inv.total)}</td>
            <td style="text-align:right;">${fmt(inv.paid)}</td>
            <td style="text-align:right;font-weight:600;">
              {#if saldo(inv) === null}
                <span style="color:var(--text-muted);">—</span>
              {:else if saldo(inv) === 0}
                <span class="text-success">Saldada</span>
              {:else}
                ${fmt(saldo(inv))}
              {/if}
            </td>
            <td>
              <span class="badge {inv.status === 'anulada' ? 'badge-secondary' : 'badge-primary'}">
                {inv.status.toUpperCase()}
              </span>
            </td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon" title="Ver factura"
                      on:click={() => goto(`/invoices/detail?id=${inv.id}`)}>🔎</button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="10" style="text-align:center;padding:30px;color:var(--text-muted);">
              Ninguna factura en este rango de fechas.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- Buscar por número. Mismo patrón combobox que Cotizaciones y Órdenes, sin
     la carrera de blur de los otros combobox de esta app. -->
<Modal bind:show={buscandoPorNumero} title="Buscar factura por número" maxWidth="620px">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="buscador"
    type="search"
    role="combobox"
    autofocus
    bind:value={consultaNumero}
    on:input={alTeclearNumero}
    on:keydown={alPulsarNumero}
    placeholder="FAC-000012"
    aria-label="Número de factura"
    aria-expanded={resultadosNumero.length > 0}
    aria-controls="resultados-factura-numero"
    aria-autocomplete="list"
    aria-activedescendant={elegidaNumero >= 0 ? `resultado-factura-numero-${elegidaNumero}` : undefined}
    autocomplete="off"
  />

  {#if consultaNumero.trim() === ''}
    <p class="form-hint">
      Escriba el número. Se busca en todas las facturas, también fuera del rango de fechas.
    </p>
  {:else if resultadosNumero.length === 0}
    <p class="empty-state">Ninguna factura con ese número.</p>
  {:else}
    <ul class="resultados" id="resultados-factura-numero" role="listbox" aria-label="Facturas encontradas">
      {#each resultadosNumero as factura, indice (factura.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="resultado-factura-numero-{indice}"
          class="resultado"
          class:elegido={indice === elegidaNumero}
          role="option"
          aria-selected={indice === elegidaNumero}
          on:click={() => (elegidaNumero = indice)}
          on:dblclick={abrirElegidaNumero}
        >
          <span class="numero">{factura.invoice_number || `#${factura.id}`}</span>
          <span class="cliente">{factura.client_name || '—'}</span>
          <span class="fecha">{formatDateAbsolute(factura.date)}</span>
          <span class="total">{fmt(factura.total)}</span>
          <span class="badge {statusBadgeClass(factura.status)}">{statusLabel(factura.status)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <svelte:fragment slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (buscandoPorNumero = false)}>
      Cancelar
    </button>
    <button type="button" class="btn btn-primary" on:click={abrirElegidaNumero} disabled={elegidaNumero < 0}>
      Abrir factura
    </button>
  </svelte:fragment>
</Modal>

<style>
  /* `--accent-active`, no `--primary`: en oscuro el acento como LETRA da 3.08:1
     sobre la tarjeta y no pasa AA. El activo da 7.34:1 en oscuro y 9.93:1 en
     claro. Desktop tiene el mismo fallo en otras pantallas; queda anotado. */

  /* Se marca la FECHA, no la fila entera.
     Tintar la fila de rojo bajaba el gris de `--text-muted` a 4.35:1 sobre ese
     fondo —pasa de sobra sobre la tarjeta, 4.76:1— y ademas se hacia raro leer
     el resto de la fila. Marcar la celda que de verdad esta vencida es mas
     preciso y `--danger-text` da 6.47:1 en claro y 5.29:1 en oscuro. */
  .vencida {
    color: var(--danger-text) !important;
    font-weight: 700;
  }

  .rango {
    margin: 0 0 var(--sp-3);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }

  /* Campos sueltos del diálogo de número: el estilo de campo cuelga de
     `.form-grid`, y aquí no hay rejilla. */
  .buscador {
    width: 100%;
    font-family: inherit;
    font-size: var(--font-sm);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .resultados {
    list-style: none;
    margin: var(--sp-3) 0 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
  }

  .resultado {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    cursor: pointer;
  }

  .resultado:last-child {
    border-bottom: none;
  }

  .resultado:hover {
    background: var(--bg-hover);
  }

  .resultado.elegido {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .numero {
    font-weight: 600;
  }

  .cliente,
  .fecha {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fecha {
    font-size: var(--font-xs);
  }

  .total {
    font-weight: 600;
  }

  @media (max-width: 560px) {
    .resultado {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }
</style>
