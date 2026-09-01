<script>
  import { page } from '$app/stores';
  import {
    formatDate,
    formatMoney,
    recordStateBadgeClass,
    recordStateLabel,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import { Icon } from '@esr/ui';

  /**
   * Historial de cotizaciones del evento.
   *
   * Lo que la ficha esconde: las canceladas y las que están fuera de
   * circulación. Por eso la consulta NO lleva `is_active` en el `WHERE` — eso
   * es el propósito de la pantalla, no un descuido.
   *
   * Svelte CLÁSICO, como el resto de ESR Pro.
   */
  let evento = null;
  let cotizaciones = [];

  /* El id se lee de forma REACTIVA, no en `onMount`: SvelteKit reutiliza el
     componente cuando solo cambia la query. Mismo patrón que la ficha. */
  $: eventoId = $page.url.searchParams.get('id');
  let cargadoId;
  $: if (eventoId !== cargadoId) {
    cargadoId = eventoId;
    cargar(eventoId);
  }

  async function cargar(id) {
    if (!window.api?.db || !id) return;
    const [ev, qs] = await Promise.all([
      window.api.db.getOne('SELECT id, name FROM events WHERE id = ?', [id]),
      window.api.db.get(
        `SELECT q.id, q.quote_number, q.date, q.total, q.status, q.is_active,
                c.name AS client_name
         FROM quotations q
         LEFT JOIN clients c ON c.id = q.client_id
         WHERE q.event_id = ?
         ORDER BY q.id DESC`,
        [id]
      )
    ]);
    evento = ev;
    cotizaciones = qs;
  }

  const numero = (q) => q.quote_number || `#${String(q.id).padStart(5, '0')}`;
</script>

<div class="herramientas">
  <div class="titulo">
    <div class="grupo">
      <a
        class="grupo-btn"
        href="/events/edit?id={eventoId}"
        aria-label="Volver al evento"
        title="Volver al evento"
      >
        <Icon name="back" size={18} />
      </a>
    </div>
    <h2 class="page-title">Historial de cotizaciones</h2>
    {#if evento}<span class="evento">{evento.name}</span>{/if}
  </div>
</div>

<div class="card">
  <!-- Sin filtros a propósito: la ficha ya esconde las canceladas y las que
       están fuera de circulación, y esta pantalla existe para verlas. -->
  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th>Número</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th style="text-align:right;">Total</th>
          <th>Estado</th>
          <!-- Dos ejes distintos, y aquí se ven los dos: un archivado no es un
               cancelado. En la ficha solo se ve el de negocio. -->
          <th>Circulación</th>
          <th style="text-align:right;"></th>
        </tr>
      </thead>
      <tbody>
        {#each cotizaciones as q (q.id)}
          <tr>
            <td style="font-weight:600;">{numero(q)}</td>
            <td>{q.client_name || '—'}</td>
            <td>{q.date ? formatDate(q.date) : '—'}</td>
            <td style="text-align:right;">{formatMoney(q.total)}</td>
            <td><span class="badge {statusBadgeClass(q.status)}">{statusLabel(q.status)}</span></td>
            <td>
              <span class="badge {recordStateBadgeClass(q.is_active)}">
                {recordStateLabel(q.is_active)}
              </span>
            </td>
            <td style="text-align:right;">
              <a class="btn-view" href="/quotations/edit?id={q.id}">Ver</a>
            </td>
          </tr>
        {:else}
          <tr>
            <!-- `.empty-state` en un <p> DENTRO de la celda, nunca sobre el
                 <td>: en la misma capa, `.table td` le ganaría. -->
            <td colspan="7"><p class="empty-state">Este evento no tiene ninguna cotización.</p></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .titulo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-3);
  }

  .page-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
  }

  .evento {
    color: var(--text-secondary);
  }
</style>
