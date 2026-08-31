<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { validateEventInput } from '@esr/schemas';
  import { statusBadgeClass, statusLabel } from '@esr/core';
  import { EventCalendar, Icon, Modal } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';

  const ESTADOS = [
    { value: '', label: 'Cualquier estado' },
    { value: 'tentativo', label: 'Tentativo' },
    { value: 'confirmado', label: 'Confirmado' },
    { value: 'completado', label: 'Completado' },
    { value: 'cancelado', label: 'Cancelado' }
  ];

  let events = [];
  let clients = [];
  let quotations = [];
  let workOrders = [];
  let eventTypes = [];

  let estado = '';
  let busqueda = '';
  let calendario = false;
  let recargando = false;

  /**
   * Los eventos VIVOS.
   *
   * `is_active = 1` fijo, y no un filtro: un evento tiene UN ciclo de vida
   * —tentativo, confirmado, completado, cancelado— y ese es el que el cliente
   * entiende. El eje de circulacion que habia encima —activo, inactivo,
   * archivado— era un segundo estado paralelo, y sus botones permitian archivar
   * un evento y perderlo de vista sin forma de recuperarlo. Se retira un evento
   * CANCELANDOLO.
   */
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
    const [c, q, w, t] = await Promise.all([
      window.api.db.get('SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC'),
      // Solo las HUERFANAS: enganchar una que ya es de otro evento seria
      // robarsela sin avisar.
      window.api.db.get(
        "SELECT id FROM quotations WHERE is_active = 1 AND event_id IS NULL ORDER BY id DESC"
      ),
      window.api.db.get(
        'SELECT id FROM work_orders WHERE is_active = 1 AND event_id IS NULL ORDER BY id DESC'
      ),
      window.api.db.get('SELECT id, name, color FROM event_types WHERE is_active = 1 ORDER BY name ASC')
    ]);
    clients = c;
    quotations = q;
    workOrders = w;
    eventTypes = t;
  }

  onMount(() => {
    loadEvents();
    loadCatalogos();
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
   * El filtrado es EN MEMORIA, y es deliberado: la consulta ya trajo todas las
   * filas de SQLite. Misma decision que documenta el `FilterBar` de escritorio.
   */
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = events.filter((e) => {
    if (estado && e.status !== estado) return false;
    if (!termino) return true;
    return [e.name, e.client_name, e.location].some((v) =>
      (v ?? '').toLowerCase().includes(termino)
    );
  });

  /**
   * El color del tipo, resuelto POR NOMBRE.
   *
   * `events.event_type` guarda el nombre en texto libre, no una clave ajena.
   * Renombrar un tipo deja sin color a sus eventos; es anterior a este cambio.
   */
  const GRIS = '#94a3b8';
  $: colores = new Map(eventTypes.map((t) => [String(t.name).trim().toLowerCase(), t.color]));
  $: colorDe = (ev) => colores.get(String(ev?.event_type ?? '').trim().toLowerCase()) || GRIS;

  // ── Alta, en un dialogo ──────────────────────────────────────────────────
  //
  // Solo la cabecera y la logistica. Editar es una PAGINA, no este dialogo:
  // trece campos dentro de un modal se leen mal, y el modal de edicion era
  // ademas el que se abria solo por una colision de nombres.
  let creando = false;
  let guardando = false;
  let errorCrear = '';

  const VACIO = {
    client_id: '',
    name: '',
    event_type: '',
    date: new Date().toISOString().split('T')[0],
    departure_time: '',
    setup_time: '',
    pickup_date: '',
    pickup_time: '',
    location: '',
    responsible_person: '',
    notes: '',
    quotation_id: '',
    work_order_id: '',
    status: 'tentativo'
  };
  let nuevo = { ...VACIO };

  function abrirAlta() {
    nuevo = { ...VACIO, event_type: eventTypes[0]?.name ?? '' };
    errorCrear = '';
    creando = true;
  }

  async function crear() {
    if (!validateEventInput(nuevo).valid) {
      errorCrear = 'El nombre del evento y el cliente son obligatorios.';
      return;
    }
    guardando = true;
    errorCrear = '';
    try {
      const res = await window.api.db.run(
        `INSERT INTO events
           (client_id, name, event_type, date, departure_time, setup_time, pickup_date,
            pickup_time, location, responsible_person, notes, status, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          nuevo.client_id, nuevo.name, nuevo.event_type, nuevo.date,
          nuevo.departure_time, nuevo.setup_time, nuevo.pickup_date || nuevo.date,
          nuevo.pickup_time, nuevo.location, nuevo.responsible_person,
          nuevo.notes, nuevo.status
        ]
      );

      // El vinculo se escribe en el DOCUMENTO, no en el evento: `quotations.
      // event_id` es el que de verdad los une, y escribir tambien
      // `events.quotation_id` crearia un segundo vinculo que puede contradecir
      // al primero.
      if (nuevo.quotation_id) {
        await window.api.db.run(
          'UPDATE quotations SET event_id = ? WHERE id = ? AND event_id IS NULL',
          [res.id, nuevo.quotation_id]
        );
      }
      if (nuevo.work_order_id) {
        await window.api.db.run(
          'UPDATE work_orders SET event_id = ? WHERE id = ? AND event_id IS NULL',
          [res.id, nuevo.work_order_id]
        );
      }

      creando = false;
      goto(`/events/edit?id=${res.id}`);
    } finally {
      guardando = false;
    }
  }

  const abrirFicha = (ev) => goto(`/events/edit?id=${ev.id}`);
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
      aria-label="Recargar la agenda"
      title="Recargar la agenda"
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
</div>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Nombre, cliente o lugar', value: busqueda }}
    selects={[
      { name: 'status', label: 'Estado del evento', value: estado, options: ESTADOS, width: '11rem' }
    ]}
    onSearch={(v) => (busqueda = v)}
    onSelect={(_, v) => (estado = v)}
  >
    <button slot="actions" type="button" class="btn btn-primary btn-new" on:click={abrirAlta}>
      Nuevo evento
    </button>
  </FilterBar>

  {#if calendario}
    <EventCalendar events={visibles} colorOf={colorDe} onSelect={abrirFicha} />
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each visibles as ev (ev.id)}
            <tr>
              <!-- El color del tipo entra por `style` porque sale de la base de
                   datos: no hay forma de tenerlo en una hoja de estilos. -->
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
                <!-- Badge del sistema. Antes iba en ALL CAPS con CSS local, que
                     por ir sin capa anulaba la pildora compartida. -->
                <span class="badge {statusBadgeClass(ev.status)}">{statusLabel(ev.status)}</span>
              </td>
              <td style="text-align: right;">
                <!-- Una sola accion. Marcar como completado y los botones de
                     circulacion se fueron: el estado se cambia en la ficha. -->
                <a class="btn-view" href="/events/edit?id={ev.id}">Editar</a>
              </td>
            </tr>
          {:else}
            <tr>
              <!-- `.empty-state` va en un <p> DENTRO de la celda, nunca sobre el
                   <td>: en la misma capa, `.table td` le ganaria. -->
              <td colspan="6">
                <p class="empty-state">
                  {termino || estado
                    ? 'Ningún evento coincide con el filtro.'
                    : 'No hay eventos en la agenda.'}
                </p>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<Modal bind:show={creando} title="Nuevo evento" maxWidth="750px">
  {#if errorCrear}<div class="alert alert-danger">{errorCrear}</div>{/if}

  <div class="form-grid">
    <div class="form-field full">
      <label for="ev-name">Nombre del evento *</label>
      <input id="ev-name" type="text" bind:value={nuevo.name} placeholder="Boda Rivas-Gómez" />
    </div>

    <div class="form-field">
      <label for="ev-client">Cliente *</label>
      <select id="ev-client" bind:value={nuevo.client_id}>
        <option value="">Seleccione cliente…</option>
        {#each clients as client (client.id)}
          <option value={client.id}>{client.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-field">
      <label for="ev-type">Tipo de evento</label>
      <div class="con-muestra">
        <select id="ev-type" bind:value={nuevo.event_type}>
          <option value="">Sin tipo</option>
          {#each eventTypes as et (et.id)}
            <option value={et.name}>{et.name}</option>
          {/each}
        </select>
        <span class="muestra" style="background: {colorDe(nuevo)}" aria-hidden="true"></span>
      </div>
    </div>

    <div class="form-field">
      <label for="ev-date">Fecha del evento</label>
      <input id="ev-date" type="date" bind:value={nuevo.date} />
    </div>

    <p class="separador">Logística</p>

    <div class="form-field">
      <label for="ev-departure">Hora de salida (almacén)</label>
      <input id="ev-departure" type="time" bind:value={nuevo.departure_time} />
    </div>
    <div class="form-field">
      <label for="ev-setup">Hora de montaje</label>
      <input id="ev-setup" type="time" bind:value={nuevo.setup_time} />
    </div>
    <div class="form-field">
      <label for="ev-pickup-date">Fecha de recogida / desmontaje</label>
      <input id="ev-pickup-date" type="date" bind:value={nuevo.pickup_date} />
    </div>
    <div class="form-field">
      <label for="ev-pickup-time">Hora de recogida</label>
      <input id="ev-pickup-time" type="time" bind:value={nuevo.pickup_time} />
    </div>
    <div class="form-field">
      <label for="ev-location">Lugar / locación</label>
      <input id="ev-location" type="text" bind:value={nuevo.location} placeholder="Dirección o salón" />
    </div>
    <div class="form-field">
      <label for="ev-responsible">Responsable comercial</label>
      <input id="ev-responsible" type="text" bind:value={nuevo.responsible_person} />
    </div>

    <p class="separador">Documentos</p>

    <div class="form-field">
      <label for="ev-quote">Vincular cotización</label>
      <select id="ev-quote" bind:value={nuevo.quotation_id}>
        <option value="">(Ninguna)</option>
        {#each quotations as qt (qt.id)}
          <option value={qt.id}>Cotización #{String(qt.id).padStart(5, '0')}</option>
        {/each}
      </select>
    </div>
    <div class="form-field">
      <label for="ev-order">Vincular orden de trabajo</label>
      <select id="ev-order" bind:value={nuevo.work_order_id}>
        <option value="">(Ninguna)</option>
        {#each workOrders as wo (wo.id)}
          <option value={wo.id}>WO-{String(wo.id).padStart(5, '0')}</option>
        {/each}
      </select>
    </div>

    <p class="form-hint pista">
      Solo se ofrecen las que aún no pertenecen a ningún evento.
    </p>

    <div class="form-field full">
      <label for="ev-notes">Condiciones o notas del evento</label>
      <textarea id="ev-notes" rows="3" bind:value={nuevo.notes}></textarea>
    </div>
  </div>

  <div slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (creando = false)}>Cancelar</button>
    <button type="button" class="btn btn-primary" on:click={crear} disabled={guardando}>
      {guardando ? 'Creando…' : 'Crear evento'}
    </button>
  </div>
</Modal>

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

  /* Rótulo de sección dentro de la rejilla del diálogo. */
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
</style>
