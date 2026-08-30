<script>
  import { onMount } from 'svelte';
  import { RECORD_STATES, RECORD_STATE_FILTER_LABELS, recordStateBadgeClass, recordStateLabel } from '@esr/core';
  import FilterBar from '$lib/components/list/FilterBar.svelte';

  /**
   * Listado de clientes. El alta y la edicion se fueron a `/clients/edit`, que
   * es el patron del resto de la app (cotizaciones, ordenes, conduces,
   * paquetes): el modal de 500 px no daba para el formulario mas el directorio
   * de direcciones.
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

  // El filtro de texto es en memoria: la consulta ya trajo todas las filas del
  // estado elegido, y la lista es corta. Mismos campos que busca Cloud.
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = termino
    ? clients.filter((c) =>
        [c.name, c.email, c.phone, c.contact_person, c.document_id]
          .some((v) => (v ?? '').toLowerCase().includes(termino))
      )
    : clients;

  function cambiarEstado(_, valor) {
    viewState = Number(valor);
    loadClients();
  }
</script>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Nombre, documento, email o teléfono', value: busqueda }}
    selects={[
      { name: 'state', label: 'Estado', value: viewState, options: opcionesEstado, width: '11rem' }
    ]}
    onSearch={(v) => (busqueda = v)}
    onSelect={cambiarEstado}
  >
    <a slot="actions" class="btn btn-primary btn-new" href="/clients/edit">Nuevo cliente</a>
  </FilterBar>

  <div class="table-wrapper">
    <table class="table">
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
