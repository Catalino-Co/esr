<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    PERIODOS,
    PERIODO_LABELS,
    formatDateAbsolute,
    parsePeriodo,
    periodoDeRango,
    rangoDelPeriodo,
    shouldReserveStock,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import { generateWorkOrderPDF } from '@esr/reports';
  import { Icon, Modal, PdfPreviewModal } from '@esr/ui';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';
  import { dangerModal } from '$lib/stores/dangerModal.js';

  /**
   * Los estados de ESR Pro, que NO son los de Cloud.
   *
   * Aquí el ciclo es pendiente → preparado → cargado → entregado → en recogida →
   * retornado → cerrado; en Cloud es otro. Unificarlos es migrar datos en las
   * dos bases y reescribir las reservas de stock: queda anotado como deuda.
   */
  const ESTADOS = [
    { value: '', label: 'Cualquier estado' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'preparado', label: 'Preparado' },
    { value: 'cargado', label: 'Cargado' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'en recogida', label: 'En recogida' },
    { value: 'retornado', label: 'Retornado' },
    { value: 'cerrado', label: 'Cerrado' }
  ];

  /** El siguiente paso del ciclo, y cómo se llama el botón que lo da. */
  const SIGUIENTE = {
    pendiente: { estado: 'preparado', texto: 'Preparar' },
    preparado: { estado: 'cargado', texto: 'Cargar' },
    cargado: { estado: 'entregado', texto: 'Entregar' },
    entregado: { estado: 'en recogida', texto: 'Recoger' },
    'en recogida': { estado: 'retornado', texto: 'Retornar' }
  };

  let workOrders = [];
  let estado = '';
  let busqueda = '';
  let recargando = false;

  /* La ventana de fechas. Va en SQL y no en memoria, al contrario que el resto
     de los filtros de esta pantalla: los demás acotan lo que ya se trajo, y la
     ventana es precisamente lo que decide CUÁNTO se trae. Sin ella, una
     instalación de cinco años carga cinco años en cada visita. */
  let desde = '';
  let hasta = '';
  $: rangoActivo = periodoDeRango(desde, hasta);

  let showPdfPreview = false;
  let pdfPreviewUrl = '';
  let pdfPreviewFilename = '';
  let pdfPreviewTitle = '';

  /**
   * Las órdenes VIVAS de la ventana.
   *
   * `is_active = 1` fijo, y no un filtro: una orden tiene UN ciclo de vida y ese
   * es el que el cliente entiende. El eje de circulación que había encima
   * —activa, inactiva, archivada— era un segundo estado paralelo, y sus botones
   * permitían archivar una orden y perderla de vista sin forma de recuperarla.
   */
  async function loadWorkOrders() {
    if (!window.api?.db) return;
    const where = ['w.is_active = 1'];
    const params = [];
    // `w.date` es TEXT `YYYY-MM-DD`: comparar cadenas coincide con comparar
    // fechas porque los ceros van a la izquierda. Y las órdenes SIN fecha no
    // desaparecen nunca, igual que en Cloud: esconderlas dejaría una orden a la
    // que se le olvidó la fecha invisible sin que nada lo dijera.
    if (desde) { where.push('(w.date IS NULL OR w.date >= ?)'); params.push(desde); }
    if (hasta) { where.push('(w.date IS NULL OR w.date <= ?)'); params.push(hasta); }

    workOrders = await window.api.db.get(
      `SELECT w.*, c.name AS client_name, e.name AS event_name
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN events e ON e.id = w.event_id
       WHERE ${where.join(' AND ')}
       ORDER BY w.date DESC, w.id DESC`,
      params
    );
  }

  onMount(async () => {
    /* El rango por defecto sale del ajuste de empresa, igual que en Cloud. Aquí
       no viaja en la URL: los filtros de ESR Pro viven en la pantalla, como
       documenta su propio `FilterBar`. */
    let periodo = 'mes';
    try {
      const fila = await window.api?.settings?.getCompany?.();
      periodo = parsePeriodo(fila?.default_order_range);
    } catch {
      /* sin puente: queda el mes, que es el valor por defecto */
    }
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    await loadWorkOrders();
  });

  async function recargar() {
    recargando = true;
    try {
      await loadWorkOrders();
    } finally {
      recargando = false;
    }
  }

  function aplicarPeriodo(periodo) {
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    loadWorkOrders();
  }

  /** Filtrado EN MEMORIA: la consulta ya trajo todas las filas de la ventana. */
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = workOrders.filter((wo) => {
    if (estado && wo.status !== estado) return false;
    if (!termino) return true;
    return [wo.client_name, wo.event_name, wo.responsible_person, numero(wo)].some(
      (v) => (v ?? '').toLowerCase().includes(termino)
    );
  });

  const numero = (wo) => `WO-${String(wo.id).padStart(5, '0')}`;

  async function avanzar(wo) {
    const paso = SIGUIENTE[wo.status];
    if (!paso) return;
    try {
      if (shouldReserveStock(paso.estado)) {
        await window.api.inventory.reserveWorkOrderStock(wo.id, paso.estado);
      } else {
        await window.api.db.run('UPDATE work_orders SET status = ? WHERE id = ?', [paso.estado, wo.id]);
      }
      loadWorkOrders();
    } catch (err) {
      dangerModal.show(err?.message || 'No se pudo reservar el stock de la orden.');
      console.error(err);
    }
  }

  async function imprimir(wo) {
    const items = await window.api.db.get(`
      SELECT wi.quantity, i.name, i.internal_code
      FROM work_order_items wi JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]);
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateWorkOrderPDF(wo, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle = `Orden ${numero(wo)}`;
    showPdfPreview = true;
  }

  /**
   * Al conduce REAL, no a un PDF inventado.
   *
   * Aquí había un botón «Generar Conduce» que llamaba a `generateConducePDF`
   * pasándole LA ORDEN, y titulaba «Conduce WO-00000». No creaba nada, no
   * quedaba registrado y numeraba con el número de la orden: era un segundo
   * «conduce» que competía con la entidad de verdad y por eso el término salía
   * donde nadie lo esperaba. Ahora hace lo mismo que el botón del editor.
   */
  async function irAlConduce(wo) {
    const existente = await window.api.db.getOne(
      'SELECT id FROM conduces WHERE work_order_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
      [wo.id]
    );
    goto(existente ? `/conduces/edit?id=${existente.id}` : `/conduces/edit?wo=${wo.id}`);
  }

  /* ── Buscar una orden por su número ─────────────────────────────────────
   * Va contra TODA la base, sin ventana de fechas ni `is_active`: si se busca
   * por número es porque se sabe cuál es, y una archivada tiene que aparecer.
   * Por eso la fila enseña el estado.
   *
   * Aquí el número no es una columna —SQLite no tiene `order_number`, al revés
   * que Postgres—: es el `WO-#####` que se calcula desde el id, así que se
   * busca por las dos formas.
   */
  let buscandoOrden = false;
  let consulta = '';
  let resultados = [];
  let elegida = -1;

  function abrirBuscador() {
    consulta = '';
    resultados = [];
    elegida = -1;
    buscandoOrden = true;
  }

  let temporizador = null;
  function alTeclear() {
    elegida = -1;
    clearTimeout(temporizador);
    temporizador = setTimeout(buscarPorNumero, 250);
  }

  async function buscarPorNumero() {
    const crudo = consulta.trim().replace(/^#/, '');
    if (crudo.length < 1 || !window.api?.db) {
      resultados = [];
      return;
    }
    const soloId = crudo.replace(/^wo-?/i, '').replace(/^0+/, '');
    resultados = await window.api.db.get(
      `SELECT w.id, w.date, w.status, c.name AS client_name
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       WHERE CAST(w.id AS TEXT) LIKE '%' || ? || '%'
          OR printf('WO-%05d', w.id) LIKE '%' || ? || '%'
       ORDER BY (CAST(w.id AS TEXT) = ?) DESC, w.date DESC, w.id DESC
       LIMIT 10`,
      [soloId, crudo, soloId]
    );
    elegida = resultados.length > 0 ? 0 : -1;
  }

  function alPulsar(evento) {
    if (resultados.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      elegida = (elegida + 1) % resultados.length;
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      elegida = (elegida - 1 + resultados.length) % resultados.length;
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      abrirElegida();
    }
  }

  function abrirElegida() {
    const orden = resultados[elegida];
    if (!orden) return;
    buscandoOrden = false;
    // ESR Pro no tiene ficha de solo lectura: su «Ver» va al editor.
    goto(`/work_orders/edit?id=${orden.id}`);
  }
</script>

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
    <!-- Va en el grupo de navegación, no entre los filtros: no acota lo que se
         ve, lleva a otra pantalla. -->
    <button
      type="button"
      class="grupo-btn"
      on:click={abrirBuscador}
      aria-label="Buscar una orden por su número"
      title="Buscar una orden por su número"
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
      value={estado}
      options={ESTADOS}
      label="Estado de la orden"
      onchange={(e) => (estado = e.currentTarget.value)}
    />
    <button type="button" class="btn btn-primary btn-new" on:click={() => goto('/work_orders/edit')}>
      Nueva orden
    </button>
  </div>
</div>

<div class="card">
  <!-- Fila propia y no `FilterBar`: aquí las fechas se aplican con un botón y van
       DELANTE del buscador, y su FilterBar ni siquiera tiene fechas. Las clases
       son las compartidas de theme.css, así que no nace CSS nuevo. -->
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
      on:click={loadWorkOrders}
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
        bind:value={busqueda}
        placeholder="Número, cliente, evento o responsable"
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

  <!-- El rango se dice SIEMPRE: la pantalla abre con un filtro puesto, y
       callarlo hace que una orden que no aparece parezca perdida. -->
  <p class="rango">
    {#if desde && hasta}
      Órdenes del {formatDateAbsolute(desde)} al {formatDateAbsolute(hasta)}
    {:else if desde}
      Órdenes desde el {formatDateAbsolute(desde)}
    {:else if hasta}
      Órdenes hasta el {formatDateAbsolute(hasta)}
    {:else}
      Todas las órdenes
    {/if}
    · {visibles.length} {visibles.length === 1 ? 'resultado' : 'resultados'}
  </p>

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th>Número</th>
          <th>Cliente</th>
          <th>Evento</th>
          <th>Fecha</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each visibles as wo (wo.id)}
          <tr>
            <td style="font-weight:600;">{numero(wo)}</td>
            <td>{wo.client_name || '—'}</td>
            <td>{wo.event_name || '—'}</td>
            <!-- Absoluta y no relativa: en una lista de fechas de operación,
                 «hace 3 días» no sirve para lo que se está buscando. -->
            <td>{formatDateAbsolute(wo.date)}</td>
            <td>{wo.responsible_person || '—'}</td>
            <td>
              <!-- Badge del sistema. Antes iba en ALL CAPS con CSS local, que
                   por ir sin capa anulaba la píldora compartida. -->
              <span class="badge {statusBadgeClass(wo.status)}">{statusLabel(wo.status)}</span>
            </td>
            <td class="acciones">
              {#if SIGUIENTE[wo.status]}
                <!-- La acción de negocio va con ETIQUETA, no con un icono mudo:
                     «Preparar» y «Cargar» no tienen glifo que se entienda solo. -->
                <button type="button" class="btn btn-secondary btn-sm" on:click={() => avanzar(wo)}>
                  {SIGUIENTE[wo.status].texto}
                </button>
              {/if}
              <button
                type="button"
                class="btn-icono"
                on:click={() => imprimir(wo)}
                aria-label="Imprimir la orden {numero(wo)}"
                title="Imprimir la orden"
              >
                <Icon name="printer" size={16} />
              </button>
              <button
                type="button"
                class="btn-icono"
                on:click={() => irAlConduce(wo)}
                aria-label="Conduce de la orden {numero(wo)}"
                title="Ver o crear el conduce"
              >
                <Icon name="stock" size={16} />
              </button>
              <a
                class="btn-icono"
                href={`/checklist?wo=${wo.id}`}
                aria-label="Checklist de la orden {numero(wo)}"
                title="Checklist"
              >
                <Icon name="listChecks" size={16} />
              </a>
              <a class="btn-view" href={`/work_orders/edit?id=${wo.id}`}>Ver</a>
            </td>
          </tr>
        {:else}
          <tr>
            <!-- `.empty-state` va en un <p> DENTRO de la celda, nunca sobre el
                 <td>: en la misma capa, `.table td` le ganaría. -->
            <td colspan="7">
              <p class="empty-state">
                {termino || estado
                  ? 'Ninguna orden coincide con el filtro.'
                  : 'Ninguna orden en este rango de fechas.'}
              </p>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFilename} title={pdfPreviewTitle} />

<Modal bind:show={buscandoOrden} title="Buscar orden por número" maxWidth="620px">
  <!-- Patrón combobox: el foco NO se mueve del input, y la selección se anuncia
       con `aria-activedescendant`. Es lo que evita la carrera de blur que los
       otros combobox de esta app parchean con `mousedown` y un `setTimeout`. -->
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="buscador"
    type="search"
    role="combobox"
    autofocus
    bind:value={consulta}
    on:input={alTeclear}
    on:keydown={alPulsar}
    placeholder="WO-00012"
    aria-label="Número de orden"
    aria-expanded={resultados.length > 0}
    aria-controls="resultados-orden"
    aria-autocomplete="list"
    aria-activedescendant={elegida >= 0 ? `resultado-orden-${elegida}` : undefined}
    autocomplete="off"
  />

  {#if consulta.trim() === ''}
    <p class="form-hint">
      Escriba el número. Se busca en todas las órdenes, también fuera del rango de fechas.
    </p>
  {:else if resultados.length === 0}
    <p class="empty-state">Ninguna orden con ese número.</p>
  {:else}
    <ul class="resultados" id="resultados-orden" role="listbox" aria-label="Órdenes encontradas">
      {#each resultados as orden, indice (orden.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="resultado-orden-{indice}"
          class="resultado"
          class:elegido={indice === elegida}
          role="option"
          aria-selected={indice === elegida}
          on:click={() => (elegida = indice)}
          on:dblclick={abrirElegida}
        >
          <span class="numero">WO-{String(orden.id).padStart(5, '0')}</span>
          <span class="cliente">{orden.client_name || '—'}</span>
          <span class="fecha">{formatDateAbsolute(orden.date)}</span>
          <span class="badge {statusBadgeClass(orden.status)}">{statusLabel(orden.status)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <svelte:fragment slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (buscandoOrden = false)}>
      Cancelar
    </button>
    <button type="button" class="btn btn-primary" on:click={abrirElegida} disabled={elegida < 0}>
      Abrir orden
    </button>
  </svelte:fragment>
</Modal>

<style>
  /* Solo el botón de icono de la fila. Los badges ya NO se definen aquí: su
     versión local iba sin capa, ganaba a theme.css y forzaba el ALL CAPS. */
  .acciones {
    text-align: right;
    white-space: nowrap;
  }

  .btn-icono {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    vertical-align: middle;
    margin-right: var(--sp-1);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .btn-icono:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .rango {
    margin: 0 0 var(--sp-3);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }

  /* Campos sueltos del diálogo: el estilo de campo cuelga de `.form-grid`, y
     aquí no hay rejilla. */
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
    grid-template-columns: 7rem minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border);
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
</style>
