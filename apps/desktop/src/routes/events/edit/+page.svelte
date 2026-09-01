<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatMoney, statusBadgeClass, statusLabel } from '@esr/core';
  import { validateEventInput } from '@esr/schemas';
  import { generateEventPDF } from '@esr/reports';
  import { Icon, PdfPreviewModal } from '@esr/ui';

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
  let cotizacionesLibres = [];
  let ordenesLibres = [];
  /** Lo que de verdad cuelga del evento: `quotations.event_id`. */
  let cotizaciones = [];
  let ordenes = [];

  let vincularCotizacion = '';
  let vincularOrden = '';

  let guardando = false;
  let error = '';
  let mensaje = '';

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
    mensaje = '';

    const [ev, cl, tp, qLibres, oLibres, qs, os] = await Promise.all([
      window.api.db.getOne('SELECT * FROM events WHERE id = ?', [id]),
      window.api.db.get('SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC'),
      window.api.db.get('SELECT id, name, color FROM event_types WHERE is_active = 1 ORDER BY name ASC'),
      window.api.db.get(
        'SELECT id FROM quotations WHERE is_active = 1 AND event_id IS NULL ORDER BY id DESC'
      ),
      window.api.db.get(
        'SELECT id FROM work_orders WHERE is_active = 1 AND event_id IS NULL ORDER BY id DESC'
      ),
      // El vinculo REAL, en las dos direcciones que importan.
      window.api.db.get(
        'SELECT id, status, total FROM quotations WHERE event_id = ? AND is_active = 1 ORDER BY id DESC',
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
    cotizacionesLibres = qLibres;
    ordenesLibres = oLibres;
    cotizaciones = qs;
    ordenes = os;
    vincularCotizacion = '';
    vincularOrden = '';
  }

  async function guardar() {
    if (!validateEventInput(evento).valid) {
      error = 'El nombre del evento y el cliente son obligatorios.';
      return;
    }
    guardando = true;
    error = '';
    mensaje = '';
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

      // El vinculo se escribe en el DOCUMENTO. `AND event_id IS NULL` no es
      // adorno: entre que se pinto el desplegable y se pulso Guardar, alguien
      // pudo asignarlo desde otra pantalla.
      if (vincularCotizacion) {
        await window.api.db.run(
          'UPDATE quotations SET event_id = ? WHERE id = ? AND event_id IS NULL',
          [evento.id, vincularCotizacion]
        );
      }
      if (vincularOrden) {
        await window.api.db.run(
          'UPDATE work_orders SET event_id = ? WHERE id = ? AND event_id IS NULL',
          [evento.id, vincularOrden]
        );
      }

      mensaje = 'Evento guardado.';
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
    <div class="herramientas-datos">
      <span class="badge {statusBadgeClass(evento.status)}">{statusLabel(evento.status)}</span>
    </div>
  </div>

  {#if error}<div class="alert alert-danger">{error}</div>{/if}
  {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}

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

        <p class="separador">Documentos</p>

        <div class="form-field">
          <label for="ev-quote">Vincular cotización</label>
          <select id="ev-quote" bind:value={vincularCotizacion}>
            <option value="">(Ninguna)</option>
            {#each cotizacionesLibres as qt (qt.id)}
              <option value={qt.id}>Cotización #{String(qt.id).padStart(5, '0')}</option>
            {/each}
          </select>
        </div>
        <div class="form-field">
          <label for="ev-order">Vincular orden</label>
          <select id="ev-order" bind:value={vincularOrden}>
            <option value="">(Ninguna)</option>
            {#each ordenesLibres as wo (wo.id)}
              <option value={wo.id}>WO-{String(wo.id).padStart(5, '0')}</option>
            {/each}
          </select>
        </div>

        <p class="form-hint pista">
          Solo se ofrecen las que aún no pertenecen a ningún evento. Vincular no
          desvincula lo que ya estuviera unido a este.
        </p>

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

  .pista {
    grid-column: 1 / -1;
    margin: 0;
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
