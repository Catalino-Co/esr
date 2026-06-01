<script>
  import { onMount } from 'svelte';
  import { fmtN } from '@esr/reports';

  let stats = {
    clients: 0,
    events: 0,
    items: 0,
    packages: 0
  };

  let upcomingEvents = [];

  onMount(async () => {
    if (window.api && window.api.db) {
      try {
        const c = await window.api.db.getOne('SELECT COUNT(*) as count FROM clients');
        const e = await window.api.db.getOne('SELECT COUNT(*) as count FROM events');
        const i = await window.api.db.getOne('SELECT COUNT(*) as count FROM items');
        const p = await window.api.db.getOne('SELECT COUNT(*) as count FROM packages');
        
        stats = {
          clients: c?.count || 0,
          events: e?.count || 0,
          items: i?.count || 0,
          packages: p?.count || 0
        };

        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        upcomingEvents = await window.api.db.get(`
          SELECT e.*, c.name as client_name 
          FROM events e
          LEFT JOIN clients c ON e.client_id = c.id
          WHERE e.date >= ? AND e.date <= ? AND e.status = 'confirmado'
          ORDER BY e.date ASC, e.departure_time ASC
        `, [today, nextWeekStr]);

      } catch (err) {
        console.error("Error loading dashboard stats:", err);
      }
    }
  });
</script>

<div class="row" style="display: flex; gap: 20px; flex-wrap: wrap;">
  <div class="card" style="flex: 1; min-width: 200px; border-left: 4px solid var(--primary);">
    <h3 style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-transform: uppercase;">Total Clientes</h3>
    <div style="font-size: 2rem; font-weight: 700; margin-top: 5px; color: var(--text-main);">{fmtN(stats.clients)}</div>
  </div>

  <div class="card" style="flex: 1; min-width: 200px; border-left: 4px solid var(--success);">
    <h3 style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-transform: uppercase;">Eventos Registrados</h3>
    <div style="font-size: 2rem; font-weight: 700; margin-top: 5px; color: var(--text-main);">{fmtN(stats.events)}</div>
  </div>

  <div class="card" style="flex: 1; min-width: 200px; border-left: 4px solid var(--warning);">
    <h3 style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-transform: uppercase;">Ítems en Inventario</h3>
    <div style="font-size: 2rem; font-weight: 700; margin-top: 5px; color: var(--text-main);">{fmtN(stats.items)}</div>
  </div>

  <div class="card" style="flex: 1; min-width: 200px; border-left: 4px solid var(--info);">
    <h3 style="color: var(--text-muted); font-size: 0.9rem; font-weight: 600; text-transform: uppercase;">Paquetes Armados</h3>
    <div style="font-size: 2rem; font-weight: 700; margin-top: 5px; color: var(--text-main);">{fmtN(stats.packages)}</div>
  </div>
</div>

<div class="card" style="margin-top: 20px;">
  <div class="card-title" style="display: flex; justify-content: space-between; align-items: center;">
    <span>Eventos Próximos (7 días)</span>
    <a href="/events" style="font-size: 0.85rem; text-decoration: none; color: var(--primary);">Ver Agenda Completa →</a>
  </div>
  
  {#if upcomingEvents.length > 0}
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Evento</th>
            <th>Cliente</th>
            <th>Lugar</th>
            <th>Horas</th>
          </tr>
        </thead>
        <tbody>
          {#each upcomingEvents as ev}
            <tr>
              <td style="font-weight: 600; color: var(--primary);">{ev.date}</td>
              <td>
                <span style="font-weight: 500;">{ev.name}</span><br>
                <small style="color: var(--text-muted);">{ev.event_type}</small>
              </td>
              <td>{ev.client_name}</td>
              <td>{ev.location || '-'}</td>
              <td>
                <small>
                  <strong>Salida:</strong> {ev.departure_time || '-'} <br>
                  <strong>Montaje:</strong> {ev.setup_time || '-'}
                </small>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p style="color: var(--text-muted); text-align: center; padding: 20px;">No hay eventos confirmados para los próximos 7 días.</p>
  {/if}
</div>
