<script>
  import { onMount } from 'svelte';

  let summary = {
    totalQuotations: 0,
    totalWorkOrders: 0,
    totalRevenue: 0, // from approved quotes or closed work orders
    totalIncidents: 0,
    incidentsCost: 0
  };

  let topItems = [];
  let recentIncidents = [];

  async function loadData() {
    if (window.api && window.api.db) {
      // General Stats
      const qStats = await window.api.db.getOne("SELECT COUNT(id) as cnt, SUM(total) as revenue FROM quotations WHERE status IN ('aprobada') AND is_active = 1");
      const wStats = await window.api.db.getOne("SELECT COUNT(id) as cnt FROM work_orders WHERE status IN ('entregado', 'retornado', 'cerrado') AND is_active = 1");
      const iStats = await window.api.db.getOne("SELECT COUNT(id) as cnt, SUM(estimated_cost) as cost FROM incidents");

      summary.totalQuotations = (await window.api.db.getOne("SELECT COUNT(id) as cnt FROM quotations WHERE is_active=1")).cnt;
      summary.totalWorkOrders = (await window.api.db.getOne("SELECT COUNT(id) as cnt FROM work_orders WHERE is_active=1")).cnt;
      summary.totalRevenue = qStats?.revenue || 0;
      summary.totalIncidents = iStats?.cnt || 0;
      summary.incidentsCost = iStats?.cost || 0;

      // Top Rented Items (based on approved quotation items)
      topItems = await window.api.db.get(`
        SELECT i.name, i.internal_code, SUM(qi.quantity) as rented_times
        FROM quotation_items qi
        JOIN quotations q ON qi.quotation_id = q.id
        JOIN items i ON qi.item_id = i.id
        WHERE q.status = 'aprobada' AND q.is_active = 1
        GROUP BY i.id
        ORDER BY rented_times DESC
        LIMIT 5
      `);

      recentIncidents = await window.api.db.get(`
        SELECT inc.*, i.name as item_name
        FROM incidents inc
        LEFT JOIN items i ON inc.item_id = i.id
        ORDER BY inc.id DESC
        LIMIT 5
      `);
    }
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="card">
  <div class="card-title">
    <span>Panel de Reportes Operativos y Comerciales</span>
  </div>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 25px;">
    <div class="stat-card">
      <div class="stat-title">Ingresos Proyectados (Cotiz. Aprobadas)</div>
      <div class="stat-value text-success">${summary.totalRevenue.toFixed(2)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Cotizaciones Totales</div>
      <div class="stat-value">{summary.totalQuotations}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Órdenes de Trabajo Activas</div>
      <div class="stat-value text-primary">{summary.totalWorkOrders}</div>
    </div>
    <div class="stat-card">
      <div class="stat-title">Costo en Incidencias</div>
      <div class="stat-value text-danger">-${summary.incidentsCost.toFixed(2)}</div>
    </div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
    
    <!-- Top Items -->
    <div class="card" style="margin: 0;">
      <div class="card-title">
        <span style="font-size: 1rem;">🔥 Equipos Más Solicitados</span>
      </div>
      <table class="table" style="margin:0;">
        <thead>
          <tr>
            <th>Equipo</th>
            <th style="text-align: center;">Veces Alquilado</th>
          </tr>
        </thead>
        <tbody>
          {#each topItems as item}
            <tr>
              <td><span style="font-size: 0.8rem; color: var(--text-muted);">{item.internal_code}</span><br>{item.name}</td>
              <td style="text-align: center; font-weight: bold;">{item.rented_times}</td>
            </tr>
          {:else}
            <tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Sin data suficiente.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Recent Incidents -->
    <div class="card" style="margin: 0;">
      <div class="card-title">
        <span style="font-size: 1rem;">⚠️ Últimas Incidencias</span>
      </div>
      <table class="table" style="margin:0;">
        <thead>
          <tr>
            <th>Equipo / Tipo</th>
            <th style="text-align: right;">Costo Est.</th>
          </tr>
        </thead>
        <tbody>
          {#each recentIncidents as inc}
            <tr>
              <td>
                <span style="font-size: 0.8rem; text-transform: capitalize; font-weight: 600;">{inc.type}</span><br>
                {inc.item_name}
              </td>
              <td style="text-align: right; color: var(--danger); font-weight: bold;">${inc.estimated_cost.toFixed(2)}</td>
            </tr>
          {:else}
            <tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Sin incidencias registradas.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .stat-card {
    background: var(--bg-color);
    border: 1px solid var(--border-color);
    padding: 20px;
    border-radius: 8px;
    text-align: center;
  }
  .stat-title {
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-bottom: 10px;
    font-weight: 500;
  }
  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-main);
  }
  .text-success { color: var(--success); }
  .text-primary { color: var(--primary); }
  .text-danger { color: var(--danger); }
</style>
