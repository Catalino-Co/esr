<script>
  import { onMount } from 'svelte';
  import { RECORD_STATES, RECORD_STATE_FILTER_LABELS, recordStateBadgeClass, recordStateLabel } from '@esr/core';
  import { Icon } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  /**
   * Listado de clientes. El alta y la edicion se fueron a `/clients/edit`, que
   * es el patron del resto de la app (cotizaciones, ordenes, conduces,
   * paquetes): el modal de 500 px no daba para el formulario mas el directorio
   * de direcciones.
   *
   * Herramientas fuera de la tarjeta, igual que Cotizaciones/Facturas/Eventos:
   * navegar la pantalla es un trabajo distinto de filtrar sus datos. Sin Quick
   * range ni rango de fechas: este listado no tiene ninguna nocion de fecha
   * que filtrar.
   *
   * Sin estilos propios ni `style=` en linea: todo el vocabulario sale de
   * @esr/config/theme.css, el mismo que usa Cloud. El estilo en linea gana a
   * todo, capado o no, asi que mientras estuviera ahi ninguna clase compartida
   * podia pisarlo — que es como las dos apps se separaron.
   */
  const TONOS = { 1: 'ok', 2: 'warn', 0: 'off' };
  const opcionesEstado = RECORD_STATES.map((value) => ({
    value,
    label: RECORD_STATE_FILTER_LABELS[value],
    tone: TONOS[value]
  }));

  let viewState = 1;
  let busqueda = '';
  let clients = [];
  let recargando = false;

  async function loadClients() {
    if (window.api && window.api.db) {
      clients = await window.api.db.get(
        'SELECT * FROM clients WHERE is_active = ? ORDER BY name ASC',
        [viewState]
      );
    }
  }

  onMount(() => {
    loadClients();
  });

  async function recargar() {
    recargando = true;
    try {
      await loadClients();
    } finally {
      recargando = false;
    }
  }

  // El filtro de texto es en memoria: la consulta ya trajo todas las filas del
  // estado elegido, y la lista es corta. Mismos campos que busca Cloud.
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = termino
    ? clients.filter((c) =>
        [c.name, c.email, c.phone, c.contact_person, c.document_id]
          .some((v) => (v ?? '').toLowerCase().includes(termino))
      )
    : clients;

  function cambiarEstado(valor) {
    viewState = Number(valor);
    loadClients();
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
  </div>

  <div class="herramientas-datos">
    <StatusSelect
      value={viewState}
      options={opcionesEstado}
      label="Estado"
      onchange={(e) => cambiarEstado(e.currentTarget.value)}
    />
    <a class="btn btn-primary btn-new" href="/clients/edit">Nuevo cliente</a>
  </div>
</div>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Nombre, documento, email o teléfono', value: busqueda }}
    onSearch={(v) => (busqueda = v)}
  />

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Contacto</th>
          <th>Teléfono</th>
          <th>Email</th>
          <th>Estado</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each visibles as client (client.id)}
          <tr>
            <td>
              <strong>{client.name}</strong>
              {#if client.document_id}<div class="doc">{client.document_id}</div>{/if}
            </td>
            <td>{client.contact_person || '—'}</td>
            <td>{client.phone || '—'}</td>
            <td>{client.email || '—'}</td>
            <td>
              <span class="badge {recordStateBadgeClass(client.is_active)}">
                {recordStateLabel(client.is_active)}
              </span>
            </td>
            <td>
              <!-- Un boton con etiqueta, no un icono mudo. Los cambios de
                   estado viven en la ficha, donde esta el select de Estado,
                   igual que en Cloud: asi la fila tiene una sola accion. -->
              <a class="btn-edit" href="/clients/edit?id={client.id}">Editar</a>
            </td>
          </tr>
        {:else}
          <tr>
            <!-- `.empty-state` va en un <p> DENTRO de la celda, nunca sobre el
                 <td>: en la misma capa, `.table td` le ganaria y se comeria el
                 padding y el color. -->
            <td colspan="6">
              <p class="empty-state">
                {termino ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes con este filtro.'}
              </p>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  /* El documento bajo el nombre: es lo unico que esta pantalla necesita y que
     el vocabulario compartido no cubre. */
  .doc {
    margin-top: 2px;
    font-size: var(--font-xs);
    color: var(--text-muted);
  }
</style>
