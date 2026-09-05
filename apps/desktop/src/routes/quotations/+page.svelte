<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { generateQuotationPDF, fmt } from '@esr/reports';
  import { Icon, Modal, PdfPreviewModal } from '@esr/ui';
  import {
    PERIODOS,
    PERIODO_LABELS,
    formatDateAbsolute,
    parsePeriodo,
    periodoDeRango,
    quoteStatusFilterOptions,
    rangoDelPeriodo,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  let quotations = [];
  let showPdfPreview = false;
  let pdfPreviewUrl = "";
  let pdfPreviewFilename = "";
  let recargando = false;

  /**
   * Las opciones salen de `@esr/core`, no escritas aqui.
   *
   * Antes esta pantalla no tenia filtro y el editor llevaba su propia lista
   * —`borrador, enviada, aprobada, rechazada, vencida`—, que no coincidia con la
   * de Cloud y encima no incluia `cancelada` ni `convertida`, los dos estados
   * que el negocio si usa. Una sola constante y el problema no vuelve.
   */
  const ESTADOS = quoteStatusFilterOptions();

  /** «Cualquier estado», igual que Ordenes: no hay default no vacio. */
  let estado = '';
  let busqueda = '';

  /* La ventana de fechas. Va en SQL, no en memoria: es lo que decide CUANTAS
     filas se traen, al contrario que el texto y el estado, que filtran lo ya
     cargado. */
  let desde = '';
  let hasta = '';
  $: rangoActivo = periodoDeRango(desde, hasta);

  /**
   * Las cotizaciones VIVAS.
   *
   * `is_active = 1` fijo, y no un filtro: una cotizacion tiene UN ciclo de vida
   * —borrador, aprobada, convertida, cancelada— y ese es el que el cliente
   * entiende. El eje de circulacion que habia encima —activa, inactiva,
   * archivada— era un segundo estado paralelo que no significaba nada aqui: se
   * retira una cotizacion cancelandola.
   *
   * El JOIN con `events` es nuevo: la columna Evento la tiene Cloud y aqui
   * faltaba.
   */
  async function loadQuotations() {
    if (!window.api?.db) return;
    const where = ['q.is_active = 1'];
    const params = [];
    // `q.date` es TEXT `YYYY-MM-DD`: comparar cadenas coincide con comparar
    // fechas. Las cotizaciones SIN fecha no desaparecen nunca, igual que en
    // Ordenes: esconderlas dejaria invisible una a la que se le olvido la fecha.
    if (desde) { where.push('(q.date IS NULL OR q.date >= ?)'); params.push(desde); }
    if (hasta) { where.push('(q.date IS NULL OR q.date <= ?)'); params.push(hasta); }
    quotations = await window.api.db.get(`
      SELECT q.*, c.name as client_name, e.name as event_name
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      LEFT JOIN events  e ON q.event_id  = e.id
      WHERE ${where.join(' AND ')}
      ORDER BY q.id DESC
    `, params);
  }

  function aplicarPeriodo(periodo) {
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    loadQuotations();
  }

  /* ── El alta, en un diálogo ────────────────────────────────────────────
   *
   * Igual que en Cloud: solo la cabecera aquí, y las líneas en la ficha, que
   * es donde está el catálogo. Antes «Crear Cotización» saltaba directo al
   * editor completo para teclear cuatro campos.
   *
   * A diferencia de Cloud NO hay URL propia (`?nueva=1`): en escritorio los
   * filtros de listado tampoco viajan en la URL, y aquí no hay refresco ni
   * enlace que compartir que lo justifique.
   */
  let creando = false;
  let guardando = false;
  let errorCrear = '';
  let clientes = [];
  let eventos = [];

  /** `validity_days`, no `valid_until`: SQLite no tiene esa columna. */
  const NUEVA_VACIA = {
    event_id: '',
    client_id: '',
    validity_days: 15,
    notes: '',
    // El texto por defecto que ESR Pro ya proponía en su editor. Cloud no lo
    // tiene, pero quitarlo aquí sería perder algo que ya funcionaba.
    conditions: '50% para reserva. 50% restante antes del evento.'
  };
  let nueva = { ...NUEVA_VACIA };

  async function cargarCatalogos() {
    if (!window.api?.db) return;
    const [c, e] = await Promise.all([
      window.api.db.get(
        'SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC'
      ),
      window.api.db.get(
        'SELECT id, name, date, client_id FROM events WHERE is_active = 1 ORDER BY date DESC'
      )
    ]);
    clientes = c;
    eventos = e;
  }

  function abrirAlta() {
    nueva = { ...NUEVA_VACIA };
    errorCrear = '';
    creando = true;
  }

  /** Elegir evento arrastra a su cliente, como en Cloud. */
  function alElegirEvento(id) {
    nueva.event_id = id;
    const evento = eventos.find((e) => String(e.id) === String(id));
    if (evento?.client_id) nueva.client_id = String(evento.client_id);
  }

  async function crear() {
    if (!nueva.event_id || !nueva.client_id) {
      errorCrear = 'Evento y cliente son obligatorios.';
      return;
    }
    if (!window.api?.quotes) {
      errorCrear =
        'Reinicie ESR Pro para activar el guardado de cotizaciones: el puente con la base de datos cambió y no basta con recargar la ventana.';
      return;
    }

    guardando = true;
    errorCrear = '';
    try {
      const evento = eventos.find((e) => String(e.id) === String(nueva.event_id));
      // El mismo `quotes.save` transaccional que usa la ficha, no un INSERT a
      // pelo: es el que asigna el número y calcula los totales.
      const res = await window.api.quotes.save({
        client_id: Number(nueva.client_id),
        event_id: Number(nueva.event_id),
        date: evento?.date || new Date().toISOString().split('T')[0],
        validity_days: Number(nueva.validity_days) || 15,
        status: 'borrador',
        notes: nueva.notes,
        conditions: nueva.conditions,
        items: []
      });

      if (!res?.ok) {
        errorCrear = res?.error || 'No se pudo crear la cotización.';
        return;
      }
      // A la ficha, que es donde se cargan las líneas. El diálogo se va con la
      // navegación; no hay que cerrarlo a mano.
      goto(`/quotations/edit?id=${res.data.quote.id}`);
    } finally {
      guardando = false;
    }
  }

  onMount(async () => {
    // El rango por defecto sale del ajuste de empresa. Aqui NO viaja en la URL:
    // los filtros de Desktop viven en la pantalla, como documenta su propio
    // FilterBar.
    let periodo = 'mes';
    try {
      const fila = await window.api?.settings?.getCompany?.();
      periodo = parsePeriodo(fila?.default_quote_range);
    } catch {
      /* sin puente: queda el mes, que es el valor por defecto */
    }
    const rango = rangoDelPeriodo(periodo);
    desde = rango.desde;
    hasta = rango.hasta;
    await Promise.all([loadQuotations(), cargarCatalogos()]);
  });

  /**
   * Recargar trae TAMBIÉN los catálogos del diálogo, no solo la tabla.
   *
   * Un cliente o un evento creados en otra pantalla no aparecerían en los
   * desplegables del alta hasta reiniciar, y el botón de recargar es justo
   * donde el usuario va a buscar eso.
   */
  async function recargar() {
    recargando = true;
    try {
      await Promise.all([loadQuotations(), cargarCatalogos()]);
    } finally {
      recargando = false;
    }
  }

  /**
   * El filtrado es EN MEMORIA, y es deliberado.
   *
   * Cloud filtra en el servidor porque pagina; aqui la consulta ya trajo todas
   * las filas de SQLite. Es la misma decision que documenta el `FilterBar` de
   * escritorio y que ya sigue el listado de clientes, y por eso el estado se
   * queda en la pantalla en vez de viajar en la URL.
   */
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = quotations.filter((q) => {
    if (estado && q.status !== estado) return false;
    if (!termino) return true;
    return [q.quote_number, q.client_name, q.event_name].some((v) =>
      (v ?? '').toLowerCase().includes(termino)
    );
  });

  /** El numero real. El `#00001` de antes era el id disfrazado. */
  const numero = (q) => q.quote_number || `#${q.id}`;

  async function generatePDF(quote) {
    const rows = await window.api.db.get(`
      SELECT qi.*, i.name as item_name, p.name as package_name
      FROM quotation_items qi
      LEFT JOIN items i ON qi.item_id = i.id
      LEFT JOIN packages p ON qi.package_id = p.id
      WHERE qi.quotation_id = ?`, [quote.id]);

    // El nombre va PELADO y la etiqueta la pone `quoteItemLabel` dentro del
    // generador. Antes esta pantalla escribia «[PAQUETE] X» y el editor
    // «📦 X» para la misma cotizacion — y el emoji ademas salia como un hueco
    // en el PDF, porque las fuentes estandar de jsPDF son WinAnsi.
    const items = rows.map(r => ({
      name:       r.package_id != null ? r.package_name : r.item_name,
      item_id:    r.item_id,
      package_id: r.package_id,
      quantity:   r.quantity,
      price:      r.price,
      total:      r.quantity * r.price
    }));

    const c = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [quote.client_id]);
    if (c) { quote.client_document = c.document_id; quote.client_phone = c.phone; }

    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData?.[0] ?? null;

    const { url, filename } = generateQuotationPDF(quote, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    showPdfPreview = true;
  }

  /* ── Buscar una cotización por su número ────────────────────────────────
   * Va contra TODA la base, sin ventana de fechas ni `is_active`: si se busca
   * por número es porque se sabe cuál es, y una cancelada tiene que aparecer.
   * `quote_number` es una columna real en SQLite (migración 0012), a
   * diferencia de `work_orders`.
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
    if (termino.length < 1 || !window.api?.db) {
      resultadosNumero = [];
      return;
    }
    resultadosNumero = await window.api.db.get(
      `SELECT q.id, q.quote_number, q.date, q.status, q.total, c.name AS client_name
       FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.quote_number LIKE '%' || ? || '%'
       ORDER BY (lower(q.quote_number) = lower(?)) DESC, q.date DESC, q.id DESC
       LIMIT 10`,
      [termino, termino]
    );
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
    const quote = resultadosNumero[elegidaNumero];
    if (!quote) return;
    buscandoPorNumero = false;
    goto(`/quotations/edit?id=${quote.id}`);
  }
</script>

<!--
  Las herramientas van FUERA de la tarjeta y el contenido dentro: navegar la
  pantalla es un trabajo distinto de filtrar sus datos. Las clases viven en
  theme.css, compartidas con la lista de cotizaciones de Cloud.
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
    <!-- Navegación, no filtrado. -->
    <button
      type="button"
      class="grupo-btn"
      on:click={abrirBuscadorNumero}
      aria-label="Buscar una cotización por su número"
      title="Buscar una cotización por su número"
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
      label="Estado de la cotización"
      onchange={(e) => (estado = e.currentTarget.value)}
    />
    <button type="button" class="btn btn-primary btn-new" on:click={abrirAlta}>
      Nueva cotización
    </button>
  </div>
</div>

<div class="card">
  <!-- Fila propia y no `FilterBar`: aqui el orden es fechas -> boton Buscar ->
       buscador, con aplicacion explicita en las fechas. Calcado de Ordenes. -->
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
      on:click={loadQuotations}
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
        placeholder="Número, cliente o evento"
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

  <!-- El rango se dice SIEMPRE. -->
  <p class="rango">
    {#if desde && hasta}
      Cotizaciones del {formatDateAbsolute(desde)} al {formatDateAbsolute(hasta)}
    {:else if desde}
      Cotizaciones desde el {formatDateAbsolute(desde)}
    {:else if hasta}
      Cotizaciones hasta el {formatDateAbsolute(hasta)}
    {:else}
      Todas las cotizaciones
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
          <th>Estado</th>
          <th style="text-align: right;">Total</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each visibles as quote (quote.id)}
          <tr>
            <td style="font-weight: 600;">{numero(quote)}</td>
            <td>{quote.client_name || '—'}</td>
            <td>{quote.event_name || '—'}</td>
            <td>{quote.date || '—'}</td>
            <td>
              <!-- Badge del sistema, con la etiqueta y el tono de `@esr/core`.
                   Antes esta pantalla tenia su propio `getStatusBadgeClass` y su
                   propio CSS de badges, que ademas iba sin capa y anulaba la
                   pildora compartida. Y pintaba el estado en ALL CAPS, contra la
                   regla 5 del sistema. -->
              <span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
            </td>
            <td style="text-align: right; font-weight: 600;">${fmt(quote.total)}</td>
            <td style="text-align: right; white-space: nowrap;">
              <!-- Imprimir se conserva: es un atajo que Cloud no tiene en su
                   lista y se perderia. Aprobar, en cambio, se fue a la ficha. -->
              <button
                type="button"
                class="btn-icono"
                on:click={() => generatePDF(quote)}
                aria-label="Generar PDF de {numero(quote)}"
                title="Generar PDF"
              >
                <Icon name="printer" size={16} />
              </button>
              <a class="btn-view" href="/quotations/edit?id={quote.id}">Ver</a>
            </td>
          </tr>
        {:else}
          <tr>
            <!-- `.empty-state` va en un <p> DENTRO de la celda, nunca sobre el
                 <td>: en la misma capa, `.table td` le ganaria y se comeria el
                 padding y el color. -->
            <td colspan="7">
              <p class="empty-state">
                {termino || estado
                  ? 'Ninguna cotización coincide con el filtro.'
                  : 'Ninguna cotización en este rango de fechas.'}
              </p>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<!-- ── Alta de cotización ─────────────────────────────────────────────────
  Solo la cabecera. Las líneas se cargan en la ficha, que es donde está el
  catálogo y la comprobación de existencias.
-->
<Modal bind:show={creando} title="Nueva cotización" maxWidth="560px">
  {#if errorCrear}<div class="alert alert-danger">{errorCrear}</div>{/if}

  <div class="form-grid">
    <div class="form-field">
      <label for="alta-evento">Evento *</label>
      <select
        id="alta-evento"
        value={nueva.event_id}
        on:change={(e) => alElegirEvento(e.currentTarget.value)}
      >
        <option value="">Seleccione evento</option>
        {#each eventos as evento (evento.id)}
          <option value={String(evento.id)}>{evento.name} ({evento.date || 'sin fecha'})</option>
        {/each}
      </select>
    </div>

    <div class="form-field">
      <label for="alta-cliente">Cliente *</label>
      <select id="alta-cliente" bind:value={nueva.client_id}>
        <option value="">Seleccione cliente</option>
        {#each clientes as cliente (cliente.id)}
          <option value={String(cliente.id)}>{cliente.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-field">
      <label for="alta-validez">Validez (días)</label>
      <input id="alta-validez" type="number" min="1" bind:value={nueva.validity_days} />
    </div>

    <div class="form-field full">
      <label for="alta-notas">Notas</label>
      <textarea id="alta-notas" rows="2" bind:value={nueva.notes}></textarea>
    </div>

    <div class="form-field full">
      <label for="alta-condiciones">Condiciones</label>
      <textarea id="alta-condiciones" rows="3" bind:value={nueva.conditions}></textarea>
    </div>

    <!-- Dicho una vez, para los dos campos, y dicho de verdad: el generador
         recorre `notes` y `conditions` en el mismo bucle y los imprime los dos. -->
    <p class="form-hint aviso-impresion">
      Las dos aparecen impresas en la cotización que ve el cliente.
    </p>
  </div>

  <div slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (creando = false)}>
      Cancelar
    </button>
    <button type="button" class="btn btn-primary" on:click={crear} disabled={guardando}>
      {guardando ? 'Creando…' : 'Crear cotización'}
    </button>
  </div>
</Modal>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFilename} title="Vista previa de cotización" />

<!-- Buscar por número. Uno para los dos tipos —Ordenes ya tiene el gemelo—:
     patrón combobox con `aria-activedescendant`, sin la carrera de blur de los
     otros combobox de esta app. -->
<Modal bind:show={buscandoPorNumero} title="Buscar cotización por número" maxWidth="620px">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="buscador"
    type="search"
    role="combobox"
    autofocus
    bind:value={consultaNumero}
    on:input={alTeclearNumero}
    on:keydown={alPulsarNumero}
    placeholder="COT-00012"
    aria-label="Número de cotización"
    aria-expanded={resultadosNumero.length > 0}
    aria-controls="resultados-cotizacion-numero"
    aria-autocomplete="list"
    aria-activedescendant={elegidaNumero >= 0 ? `resultado-cotizacion-numero-${elegidaNumero}` : undefined}
    autocomplete="off"
  />

  {#if consultaNumero.trim() === ''}
    <p class="form-hint">
      Escriba el número. Se busca en todas las cotizaciones, también fuera del rango de fechas.
    </p>
  {:else if resultadosNumero.length === 0}
    <p class="empty-state">Ninguna cotización con ese número.</p>
  {:else}
    <ul class="resultados" id="resultados-cotizacion-numero" role="listbox" aria-label="Cotizaciones encontradas">
      {#each resultadosNumero as quote, indice (quote.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="resultado-cotizacion-numero-{indice}"
          class="resultado"
          class:elegido={indice === elegidaNumero}
          role="option"
          aria-selected={indice === elegidaNumero}
          on:click={() => (elegidaNumero = indice)}
          on:dblclick={abrirElegidaNumero}
        >
          <span class="numero">{quote.quote_number || `#${quote.id}`}</span>
          <span class="cliente">{quote.client_name || '—'}</span>
          <span class="fecha">{formatDateAbsolute(quote.date)}</span>
          <span class="total">{fmt(quote.total)}</span>
          <span class="badge {statusBadgeClass(quote.status)}">{statusLabel(quote.status)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <svelte:fragment slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (buscandoPorNumero = false)}>
      Cancelar
    </button>
    <button type="button" class="btn btn-primary" on:click={abrirElegidaNumero} disabled={elegidaNumero < 0}>
      Abrir cotización
    </button>
  </svelte:fragment>
</Modal>

<style>
  /* Solo el botón de icono de la fila. Los badges ya NO se definen aquí: su
     versión local iba sin capa, ganaba a theme.css y era lo que forzaba el
     redondeo de 4px y el ALL CAPS. */
  .btn-icono {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    vertical-align: middle;
    margin-right: var(--sp-2);
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

  /* El aviso va debajo de Notas y Condiciones, a lo ancho de la rejilla. No se
     reutiliza `.full` porque en theme.css eso es `.form-field.full`, y esto es
     un <p> suelto, no un campo. */
  .aviso-impresion {
    grid-column: 1 / -1;
    margin: 0;
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
    white-space: nowrap;
  }
</style>
