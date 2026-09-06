<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatDate, formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
  import { validateEventInput } from '@esr/schemas';
  import { generateEventPDF } from '@esr/reports';
  import { Icon, Modal, PdfPreviewModal } from '@esr/ui';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { toasts } from '$lib/stores/toasts.js';

  /**
   * Ficha de evento de ESR Pro.
   *
   * Es una PAGINA, no un modal. Antes los trece campos vivian dentro del
   * dialogo del listado, y ademas ese dialogo compartia su variable `editando`
   * con el «estoy viendo un evento existente»: abrir uno lo desplegaba solo.
   *
   * Va en sintaxis Svelte CLASICA (`let`, `$:`, `on:`), como el resto de
   * Desktop.
   */

  const GRIS = '#94a3b8';

  let evento = null;
  let clientes = [];
  let tipos = [];
  /** Lo que de verdad cuelga del evento: `quotations.event_id`. */
  let cotizaciones = [];
  let cotizacionesTotal = 0;
  let ordenes = [];

  /* ── Vincular ──────────────────────────────────────────────────────────
   * Antes eran dos desplegables DENTRO del formulario del evento, asi que
   * enganchar una cotizacion obligaba a pulsar «Guardar cambios» del evento
   * entero. Ahora son dos botones de la barra, cada uno con su dialogo.
   *
   * A diferencia de Cloud, el estado NO va en la URL: aqui no hay `load` ni
   * invalidacion que aprovechar, y el patron de la casa es el `bind:show` de
   * `@esr/ui`. Las candidatas se piden AL ABRIR, no en `cargar()`: asi el
   * `LIMIT 200` no se paga en cada entrada a la ficha.
   */
  let vinculando = null;
  /* `Modal` de `@esr/ui` se cierra a si mismo poniendo `show = false`, asi que
     hace falta un booleano suyo: `vinculando` guarda el TIPO, no la apertura. */
  let mostrarVinculo = false;
  let candidatos = [];
  let cargandoCandidatos = false;
  let errorVinculo = '';
  let buscarDoc = '';

  let guardando = false;
  /** Solo el «este evento ya no existe» del load: el resto pasa por Toast/Modal. */
  let error = '';

  let verPdf = false;
  let pdfUrl = '';
  let pdfNombre = 'evento.pdf';

  /**
   * El id se lee de forma REACTIVA, no en `onMount`.
   *
   * SvelteKit reutiliza el componente cuando solo cambia la query, asi que
   * `onMount` no se vuelve a ejecutar: ir del evento 4 al 7 dejaria la pantalla
   * mostrando el 4. El guarda `cargadoId` evita recargar en bucle.
   */
  $: eventoId = $page.url.searchParams.get('id');
  let cargadoId;
  $: if (eventoId !== cargadoId) {
    cargadoId = eventoId;
    cargar(eventoId);
  }

  $: colores = new Map(tipos.map((t) => [String(t.name).trim().toLowerCase(), t.color]));
  $: colorTipo = colores.get(String(evento?.event_type ?? '').trim().toLowerCase()) || GRIS;

  async function cargar(id) {
    if (!window.api?.db || !id) return;
    error = '';

    const [ev, cl, tp, qs, os] = await Promise.all([
      window.api.db.getOne('SELECT * FROM events WHERE id = ?', [id]),
      window.api.db.get('SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC'),
      window.api.db.get('SELECT id, name, color FROM event_types WHERE is_active = 1 ORDER BY name ASC'),
      // El vinculo REAL: `quotations.event_id`. SIN filtrar por `is_active`, y
      // a proposito: la tarjeta enseña lo vivo, pero la cuenta del enlace al
      // historial tiene que salir de TODO. Con dos consultas, la N mentiria.
      window.api.db.get(
        'SELECT id, quote_number, status, total, is_active FROM quotations WHERE event_id = ? ORDER BY id DESC',
        [id]
      ),
      window.api.db.get(
        'SELECT id, status FROM work_orders WHERE event_id = ? AND is_active = 1 ORDER BY id DESC',
        [id]
      )
    ]);

    if (!ev) {
      error = 'Ese evento ya no existe.';
      return;
    }

    evento = { ...ev };
    clientes = cl;
    tipos = tp;
    // La tarjeta enseña lo VIVO: activas y no canceladas. Lo demas se llega por
    // el historial, que es lo que evita que ocultar sea esconder.
    cotizacionesTotal = qs.length;
    cotizaciones = qs.filter((q) => q.is_active === 1 && q.status !== 'cancelada');
    ordenes = os;
  }

  /* ── Los dialogos de vincular ─────────────────────────────────────────── */

  /** @param {'cotizacion' | 'orden'} tipo */
  async function abrirVinculo(tipo) {
    vinculando = tipo;
    mostrarVinculo = true;
    errorVinculo = '';
    buscarDoc = '';
    candidatos = [];
    cargandoCandidatos = true;
    try {
      candidatos =
        tipo === 'cotizacion'
          ? // Las CANCELADAS no se ofrecen: la tarjeta las esconde, asi que
            // vincular una seria verla desaparecer en el acto. Un selector no
            // debe ofrecer nada que su propio resultado no vaya a mostrar.
            await window.api.db.get(
              `SELECT q.id, q.quote_number, q.date, q.total, q.status, c.name AS client_name
               FROM quotations q LEFT JOIN clients c ON c.id = q.client_id
               WHERE q.is_active = 1 AND q.event_id IS NULL AND q.status != 'cancelada'
               ORDER BY q.id DESC LIMIT 200`
            )
          : await window.api.db.get(
              `SELECT w.id, w.date, w.status, w.responsible_person, c.name AS client_name
               FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id
               WHERE w.is_active = 1 AND w.event_id IS NULL
               ORDER BY w.id DESC LIMIT 200`
            );
    } finally {
      cargandoCandidatos = false;
    }
  }

  /* Filtrado EN MEMORIA sobre lo ya traido, que es la convencion de ESR Pro:
     aqui no hay servidor al que volver por cada tecla. */
  $: terminoDoc = buscarDoc.trim().toLowerCase();
  $: candidatosVisibles = candidatos.filter((fila) => {
    if (!terminoDoc) return true;
    return [numeroCandidato(fila), fila.client_name, fila.responsible_person].some((v) =>
      (v ?? '').toLowerCase().includes(terminoDoc)
    );
  });

  const numeroCandidato = (fila) =>
    vinculando === 'cotizacion'
      ? fila.quote_number || `#${String(fila.id).padStart(5, '0')}`
      : `WO-${String(fila.id).padStart(5, '0')}`;

  /**
   * Engancha el documento al evento.
   *
   * Las tres guardas van EN LA SENTENCIA que escribe —`event_id IS NULL` y
   * `is_active = 1`—, no en un SELECT previo: entre pintar la tabla y pulsar
   * el boton, alguien pudo asignarlo desde otra pantalla. Y NO falla en
   * silencio: `db.run` devuelve `{ id, changes }`, asi que `changes === 0` es
   * un conflicto que hay que decir en voz alta.
   */
  async function vincular(id) {
    const tabla = vinculando === 'cotizacion' ? 'quotations' : 'work_orders';
    const res = await window.api.db.run(
      `UPDATE ${tabla} SET event_id = ? WHERE id = ? AND event_id IS NULL AND is_active = 1`,
      [evento.id, id]
    );
    if (res.changes === 0) {
      // El dialogo NO se cierra: el error se lee donde ocurrio, y se puede
      // elegir otra sin volver a empezar.
      errorVinculo =
        vinculando === 'cotizacion'
          ? 'Esa cotización ya pertenece a otro evento o dejó de estar activa.'
          : 'Esa orden ya pertenece a otro evento o dejó de estar activa.';
      return;
    }
    mostrarVinculo = false;
    await cargar(evento.id);
  }

  async function guardar() {
    if (!validateEventInput(evento).valid) {
      dangerModal.show('El nombre del evento y el cliente son obligatorios.');
      return;
    }
    guardando = true;
    try {
      await window.api.db.run(
        `UPDATE events SET
           client_id = ?, name = ?, event_type = ?, date = ?, departure_time = ?,
           setup_time = ?, pickup_date = ?, pickup_time = ?, location = ?,
           responsible_person = ?, notes = ?, status = ?
         WHERE id = ?`,
        [
          evento.client_id, evento.name, evento.event_type, evento.date,
          evento.departure_time, evento.setup_time, evento.pickup_date || evento.date,
          evento.pickup_time, evento.location, evento.responsible_person,
          evento.notes, evento.status, evento.id
        ]
      );

      toasts.success('Evento guardado.');
      await cargar(evento.id);
    } finally {
      guardando = false;
    }
  }

  async function imprimir() {
    const cliente = evento.client_id
      ? await window.api.db.getOne('SELECT name FROM clients WHERE id = ?', [evento.client_id])
      : null;
    const empresa = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;

    const { url, filename } = generateEventPDF(
      { ...evento, client_name: cliente?.name ?? null },
      { quote: cotizaciones[0] ?? null, order: ordenes[0] ?? null },
      'preview',
      empresa
    );
    pdfUrl = url;
    pdfNombre = filename;
    verPdf = true;
  }

  const numeroCotizacion = (q) => q.quote_number || `#${String(q.id).padStart(5, '0')}`;
  const numeroOrden = (o) => o.order_number || `WO-${String(o.id).padStart(5, '0')}`;
</script>

{#if evento}
  <div class="herramientas">
    <div class="grupo">
      <a class="grupo-btn" href="/events" aria-label="Volver a eventos" title="Volver a eventos">
        <Icon name="back" size={18} />
      </a>
      <button
        type="button"
        class="grupo-btn"
        on:click={imprimir}
        aria-label="Imprimir el evento"
        title="Imprimir el evento"
      >
        <Icon name="printer" size={18} />
      </button>
    </div>
    <!-- Aqui habia un badge del estado, que solo repetia lo que dice su propio
         `<select>` mas abajo. El sitio lo ocupan los dos botones de vincular. -->
    <div class="herramientas-datos">
      <button type="button" class="btn btn-secondary" on:click={() => abrirVinculo('cotizacion')}>
        Vincular cotización
      </button>
      <button type="button" class="btn btn-secondary" on:click={() => abrirVinculo('orden')}>
        Vincular orden
      </button>
    </div>
  </div>

  <div class="ficha">
    <div class="card">
      <div class="card-title">{evento.name || 'Evento'}</div>

      <div class="form-grid">
        <div class="form-field full">
          <label for="ev-name">Nombre del evento *</label>
          <input id="ev-name" type="text" bind:value={evento.name} />
        </div>

        <div class="form-field">
          <label for="ev-client">Cliente *</label>
          <select id="ev-client" bind:value={evento.client_id}>
            <option value="">Seleccione cliente…</option>
            {#each clientes as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>

        <div class="form-field">
          <label for="ev-type">Tipo de evento</label>
          <div class="con-muestra">
            <select id="ev-type" bind:value={evento.event_type}>
              <option value="">Sin tipo</option>
              {#each tipos as t (t.id)}
                <option value={t.name}>{t.name}</option>
              {/each}
            </select>
            <span class="muestra" style="background: {colorTipo}" aria-hidden="true"></span>
          </div>
        </div>

        <div class="form-field">
          <label for="ev-date">Fecha del evento</label>
          <input id="ev-date" type="date" bind:value={evento.date} />
        </div>

        <div class="form-field">
          <label for="ev-status">Estado</label>
          <select id="ev-status" bind:value={evento.status}>
            <option value="tentativo">Tentativo</option>
            <option value="confirmado">Confirmado</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <p class="separador">Logística</p>

        <div class="form-field">
          <label for="ev-departure">Hora de salida (almacén)</label>
          <input id="ev-departure" type="time" bind:value={evento.departure_time} />
        </div>
        <div class="form-field">
          <label for="ev-setup">Hora de montaje</label>
          <input id="ev-setup" type="time" bind:value={evento.setup_time} />
        </div>
        <div class="form-field">
          <label for="ev-pickup-date">Fecha de recogida / desmontaje</label>
          <input id="ev-pickup-date" type="date" bind:value={evento.pickup_date} />
        </div>
        <div class="form-field">
          <label for="ev-pickup-time">Hora de recogida</label>
          <input id="ev-pickup-time" type="time" bind:value={evento.pickup_time} />
        </div>
        <div class="form-field">
          <label for="ev-location">Lugar / locación</label>
          <input id="ev-location" type="text" bind:value={evento.location} />
        </div>
        <div class="form-field">
          <label for="ev-responsible">Responsable comercial</label>
          <input id="ev-responsible" type="text" bind:value={evento.responsible_person} />
        </div>

        <!-- El bloque «Documentos» se fue de aquí: el vínculo no es un campo del
             evento —no se guarda en `events`, se escribe en el documento—, y
             metido en este formulario obligaba a guardar el evento entero para
             enganchar una cotización. Está en la barra, en dos botones. -->

        <div class="form-field full">
          <label for="ev-notes">Condiciones o notas del evento</label>
          <textarea id="ev-notes" rows="3" bind:value={evento.notes}></textarea>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-primary" on:click={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>

    <div class="columna">
      <!-- Resumen escueto a propósito: número, total y si está aprobada. El
           detalle está en su propio documento. -->
      <div class="card tarjeta">
        <div class="card-title">Cotización</div>
        {#if cotizaciones.length === 0}
          <p class="form-hint">Sin cotización vinculada.</p>
        {:else}
          {#each cotizaciones as q (q.id)}
            <div class="resumen">
              <div class="resumen-datos">
                <span class="resumen-numero">{numeroCotizacion(q)}</span>
                <span class="badge {statusBadgeClass(q.status)}">{statusLabel(q.status)}</span>
              </div>
              <span class="resumen-total">{formatMoney(q.total)}</span>
              <a class="btn-view" href="/quotations/edit?id={q.id}">Ver</a>
            </div>
          {/each}
        {/if}

        <!-- La tarjeta enseña lo vivo, así que aquí hay que decir lo que se está
             callando: canceladas, inactivas y archivadas. Va FUERA del `{#if}`,
             en las dos ramas: si todas están canceladas, arriba pone «Sin
             cotización vinculada», y ese es justo el caso en el que hace falta
             la salida. -->
        {#if cotizacionesTotal > cotizaciones.length}
          <a class="historial" href="/events/quotes?id={evento.id}">
            Historial de cotizaciones ({cotizacionesTotal})
          </a>
        {/if}
      </div>

      <div class="card tarjeta">
        <div class="card-title">Orden</div>
        {#if ordenes.length === 0}
          <p class="form-hint">Sin orden vinculada.</p>
        {:else}
          {#each ordenes as o (o.id)}
            <div class="resumen">
              <div class="resumen-datos">
                <span class="resumen-numero">{numeroOrden(o)}</span>
                <span class="badge {statusBadgeClass(o.status)}">{statusLabel(o.status)}</span>
              </div>
              <a class="btn-view" href="/work_orders/edit?id={o.id}">Ver</a>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
  <!-- El diálogo de vincular. Uno para los dos tipos: se eligen igual y se
       vinculan igual; lo que cambia es el rótulo y que la orden no lleva
       importe. -->
  <Modal
    bind:show={mostrarVinculo}
    title={vinculando === 'cotizacion' ? 'Vincular cotización' : 'Vincular orden'}
    maxWidth="760px"
  >
    {#if errorVinculo}
      <div class="alert alert-danger">{errorVinculo}</div>
    {/if}

    <input
      class="buscador"
      type="search"
      bind:value={buscarDoc}
      placeholder="Número, cliente o responsable"
      aria-label="Buscar entre las candidatas"
    />

    {#if cargandoCandidatos}
      <p class="form-hint">Cargando…</p>
    {:else if candidatosVisibles.length === 0}
      <p class="empty-state">
        {terminoDoc
          ? `Ninguna coincide con «${buscarDoc}».`
          : vinculando === 'cotizacion'
            ? 'No hay cotizaciones libres: todas pertenecen ya a algún evento, o están canceladas.'
            : 'No hay órdenes libres: todas pertenecen ya a algún evento.'}
      </p>
    {:else}
      <div class="tabla-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Cliente</th>
              <th>Fecha</th>
              {#if vinculando === 'cotizacion'}<th style="text-align:right;">Total</th>{/if}
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each candidatosVisibles as fila (fila.id)}
              <tr>
                <td>{numeroCandidato(fila)}</td>
                <td>{fila.client_name || '—'}</td>
                <td>{fila.date ? formatDate(fila.date) : '—'}</td>
                {#if vinculando === 'cotizacion'}
                  <td style="text-align:right;">{formatMoney(fila.total)}</td>
                {/if}
                <td>
                  <span class="badge {statusBadgeClass(fila.status)}">{statusLabel(fila.status)}</span>
                </td>
                <td style="text-align:right;">
                  <button type="button" class="btn btn-primary btn-sm" on:click={() => vincular(fila.id)}>
                    Vincular
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <p class="form-hint">
      Solo se ofrecen las que aún no pertenecen a ningún evento. Vincular no
      desvincula lo que ya estuviera unido a este.
    </p>
  </Modal>
{:else if error}
  <div class="card"><div class="alert alert-danger">{error}</div></div>
{/if}

<PdfPreviewModal bind:show={verPdf} {pdfUrl} filename={pdfNombre} title="Vista previa del evento" />

<style>
  /* `app.css` de Desktop pone `margin-bottom` a toda `.card`; aquí la
     separación la da el `gap` de la columna. */
  .ficha {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(15rem, 19rem);
    gap: var(--sp-4);
    align-items: start;
  }

  .ficha .card {
    margin-bottom: 0;
  }

  .columna {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  .separador {
    grid-column: 1 / -1;
    margin: var(--sp-2) 0 0;
    padding-top: var(--sp-3);
    border-top: 1px solid var(--border);
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .historial {
    display: inline-block;
    margin-top: var(--sp-3);
    font-size: var(--font-sm);
  }

  /* Campos sueltos del diálogo: los estilos de campo cuelgan de `.form-grid`,
     y aquí no hay rejilla. */
  .buscador {
    width: 100%;
    margin-bottom: var(--sp-3);
    font-family: inherit;
    font-size: var(--font-sm);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
  }

  /* Seis columnas no caben en el diálogo: que scrollee la tabla, no el
     diálogo entero, que ya scrollea en vertical. */
  .tabla-scroll {
    overflow-x: auto;
    max-height: 22rem;
    overflow-y: auto;
  }

  .con-muestra {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }

  .con-muestra select {
    flex: 1;
    min-width: 0;
  }

  .muestra {
    width: 1.75rem;
    height: 1.75rem;
    flex-shrink: 0;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
  }

  .resumen {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
  }

  .resumen + .resumen {
    margin-top: var(--sp-3);
    padding-top: var(--sp-3);
    border-top: 1px solid var(--border);
  }

  .resumen-datos {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .resumen-numero {
    font-weight: 600;
  }

  .resumen-total {
    font-size: var(--font-lg);
    font-weight: 600;
  }

  @media (max-width: 900px) {
    .ficha {
      grid-template-columns: 1fr;
    }
  }
</style>
