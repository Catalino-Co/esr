<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { shouldReserveStock } from '@esr/core';
  import { generateWorkOrderPDF, generateConducePDF } from '@esr/reports';
  import { PdfPreviewModal } from '@esr/ui';

  let showPdfPreview    = false;
  let pdfPreviewUrl     = '';
  let pdfPreviewFilename = '';
  let pdfPreviewTitle   = '';

  let viewState  = '1';
  let workOrders = [];

  async function loadWorkOrders() {
    if (!window.api?.db) return;
    workOrders = await window.api.db.get(`
      SELECT w.*, c.name as client_name
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.is_active = ?
      ORDER BY w.id DESC
    `, [parseInt(viewState)]);
  }

  onMount(() => loadWorkOrders());

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'entregado':
      case 'cerrado':    return 'badge-success';
      case 'pendiente':  return 'badge-secondary';
      case 'preparado':
      case 'cargado':    return 'badge-info';
      case 'en recogida':
      case 'retornado':  return 'badge-primary';
      default:           return 'badge-warning';
    }
  }

  async function changeStatus(id, newStatus) {
    try {
      if (shouldReserveStock(newStatus)) {
        await window.api.inventory.reserveWorkOrderStock(id, newStatus);
      } else {
        await window.api.db.run('UPDATE work_orders SET status = ? WHERE id = ?', [newStatus, id]);
      }
      loadWorkOrders();
    } catch (err) {
      alert(err?.message || 'No se pudo reservar el stock de la orden.');
      console.error(err);
    }
  }

  async function changeState(id, newState) {
    const msg = newState === 0 ? '¿Archivar esta orden de trabajo?'
              : newState === 1 ? '¿Restaurar esta orden de trabajo?'
              : '¿Marcar orden de trabajo como inactiva?';
    if (confirm(msg)) {
      await window.api.db.run('UPDATE work_orders SET is_active = ? WHERE id = ?', [newState, id]);
      loadWorkOrders();
    }
  }

  async function printWO(wo) {
    const items = await window.api.db.get(`
      SELECT wi.quantity, i.name, i.internal_code
      FROM work_order_items wi JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]);
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateWorkOrderPDF(wo, items, 'preview', company);
    pdfPreviewUrl      = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle    = `Orden de Trabajo WO-${String(wo.id).padStart(5,'0')}`;
    showPdfPreview     = true;
  }

  async function printConduce(wo) {
    const items = await window.api.db.get(`
      SELECT wi.quantity, i.name, i.internal_code
      FROM work_order_items wi JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]);
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateConducePDF(wo, items, 'preview', company);
    pdfPreviewUrl      = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle    = `Conduce WO-${String(wo.id).padStart(5,'0')}`;
    showPdfPreview     = true;
  }
</script>

<div class="card">
  <div class="card-title" style="align-items:center;">
    <div style="display:flex;gap:15px;align-items:center;">
      <span>Órdenes de Trabajo</span>
      <select bind:value={viewState} on:change={loadWorkOrders}
        style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);font-size:.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={() => goto('/work_orders/edit')}>+ Nueva Orden de Trabajo</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each workOrders as wo}
          <tr>
            <td style="font-weight:600;color:var(--primary);">WO-{String(wo.id).padStart(5,'0')}</td>
            <td style="font-weight:500;">{wo.client_name || '—'}</td>
            <td>{wo.date}</td>
            <td style="color:var(--text-muted);">{wo.responsible_person || '—'}</td>
            <td>
              <span class="badge {getStatusBadgeClass(wo.status)}">{wo.status.toUpperCase()}</span>
            </td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon" title="Editar / Ver"
                      on:click={() => goto(`/work_orders/edit?id=${wo.id}`)}>✏️</button>
              <button class="btn-icon" title="Imprimir Orden de Trabajo"
                      on:click={() => printWO(wo)}>🖨️</button>
              <button class="btn-icon text-primary" title="Generar Conduce"
                      on:click={() => printConduce(wo)}>📝</button>
              <a href={`/checklist?wo=${wo.id}`} class="btn-icon" title="Checklist" style="text-decoration:none;">📋</a>

              <!-- Avance de estado -->
              {#if viewState === '1'}
                {#if wo.status === 'pendiente'}
                  <button class="btn-icon text-info" title="Marcar Preparado"
                          on:click={() => changeStatus(wo.id, 'preparado')}>📦</button>
                {:else if wo.status === 'preparado'}
                  <button class="btn-icon text-info" title="Marcar Cargado"
                          on:click={() => changeStatus(wo.id, 'cargado')}>🚛</button>
                {:else if wo.status === 'cargado'}
                  <button class="btn-icon text-success" title="Marcar Entregado"
                          on:click={() => changeStatus(wo.id, 'entregado')}>✅</button>
                {:else if wo.status === 'entregado'}
                  <button class="btn-icon text-warning" title="En Recogida"
                          on:click={() => changeStatus(wo.id, 'en recogida')}>↩️</button>
                {:else if wo.status === 'en recogida'}
                  <button class="btn-icon text-primary" title="Retornado"
                          on:click={() => changeStatus(wo.id, 'retornado')}>🏢</button>
                {/if}
              {/if}

              <!-- Estado activo -->
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar"
                        on:click={() => changeState(wo.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar"
                        on:click={() => changeState(wo.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar"
                        on:click={() => changeState(wo.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar"
                        on:click={() => changeState(wo.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar"
                        on:click={() => changeState(wo.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px;">
              No hay órdenes de trabajo registradas.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFilename} title={pdfPreviewTitle} />

<style>
  .btn-icon { background:none; border:none; cursor:pointer; padding:4px 5px; opacity:.6; transition:.2s; }
  .btn-icon:hover { opacity:1; transform:scale(1.1); }
  .text-danger  { color:var(--danger); }
  .text-warning { color:var(--warning); }
  .text-success { color:var(--success); }
  .text-info    { color:var(--info); }
  .text-primary { color:var(--primary); }
  .badge { padding:4px 8px; border-radius:4px; font-size:.75rem; font-weight:600; text-transform:uppercase; }
  .badge-success   { background:rgba(40,167,69,.1);   color:var(--success); }
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
  .badge-info      { background:rgba(23,162,184,.1);  color:var(--info); }
  .badge-primary   { background:rgba(67,94,190,.1);   color:var(--primary); }
  .badge-warning   { background:rgba(255,193,7,.1);   color:#d39e00; }
</style>
