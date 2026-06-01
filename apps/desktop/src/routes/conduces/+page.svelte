<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { generateConducePDF } from '@esr/reports';
  import { PdfPreviewModal } from '@esr/ui';
  import { fmt } from '@esr/reports';

  let showPdfPreview     = false;
  let pdfPreviewUrl      = '';
  let pdfPreviewFilename = '';
  let pdfPreviewTitle    = '';

  let viewState = '1';
  let conduces  = [];

  async function loadConduces() {
    if (!window.api?.db) return;
    conduces = await window.api.db.get(`
      SELECT c.*, cl.name as client_name
      FROM conduces c
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.is_active = ?
      ORDER BY c.id DESC
    `, [parseInt(viewState)]);
  }

  onMount(() => loadConduces());

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'entregado': return 'badge-success';
      case 'emitido':   return 'badge-primary';
      case 'anulado':   return 'badge-secondary';
      default:          return 'badge-warning';
    }
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run('UPDATE conduces SET status = ? WHERE id = ?', [newStatus, id]);
    loadConduces();
  }

  async function changeState(id, newState) {
    const msg = newState === 0 ? '¿Archivar este Conduce?'
              : newState === 1 ? '¿Restaurar este Conduce?'
              : '¿Marcar Conduce como inactivo?';
    if (confirm(msg)) {
      await window.api.db.run('UPDATE conduces SET is_active = ? WHERE id = ?', [newState, id]);
      loadConduces();
    }
  }

  async function printConduce(cond) {
    const items = await window.api.db.get(`
      SELECT ci.*, i.name, i.internal_code
      FROM conduce_items ci JOIN items i ON ci.item_id = i.id
      WHERE ci.conduce_id = ?`, [cond.id]);

    const printObj = {
      ...cond,
      id:          cond.work_order_id,
      conduce_id:  cond.id,
      client_name: cond.client_name
    };

    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateConducePDF(printObj, items, 'preview', company);
    pdfPreviewUrl      = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle    = `Conduce COND-${String(cond.id).padStart(5,'0')}`;
    showPdfPreview     = true;
  }
</script>

<div class="card">
  <div class="card-title" style="align-items:center;">
    <div style="display:flex;gap:15px;align-items:center;">
      <span>Conduces (Notas de Entrega)</span>
      <select bind:value={viewState} on:change={loadConduces}
        style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);font-size:.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={() => goto('/conduces/edit')}>+ Crear Conduce</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Conduce #</th>
          <th>WO Referencia</th>
          <th>Cliente</th>
          <th>Fecha Emisión</th>
          <th>Chofer / Vehículo</th>
          <th>Total</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each conduces as c}
          <tr>
            <td style="font-weight:600;color:var(--primary);">COND-{String(c.id).padStart(5,'0')}</td>
            <td style="color:var(--text-muted);">WO-{String(c.work_order_id).padStart(5,'0')}</td>
            <td style="font-weight:500;">{c.client_name || '—'}</td>
            <td>{c.date}</td>
            <td style="color:var(--text-muted);">{c.driver_or_vehicle || '—'}</td>
            <td style="font-weight:700;">${fmt(c.total)}</td>
            <td>
              <span class="badge {getStatusBadgeClass(c.status)}">{c.status.toUpperCase()}</span>
            </td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon" title="Editar / Ver"
                      on:click={() => goto(`/conduces/edit?id=${c.id}`)}>✏️</button>
              <button class="btn-icon text-primary" title="Imprimir Conduce"
                      on:click={() => printConduce(c)}>🖨️</button>

              {#if c.status === 'emitido' && viewState === '1'}
                <button class="btn-icon text-success" title="Marcar Entregado"
                        on:click={() => changeStatus(c.id, 'entregado')}>✅</button>
              {/if}

              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar"
                        on:click={() => changeState(c.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar"
                        on:click={() => changeState(c.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar"
                        on:click={() => changeState(c.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar"
                        on:click={() => changeState(c.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar"
                        on:click={() => changeState(c.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="8" style="text-align:center;color:var(--text-muted);padding:30px;">
              No hay conduces generados.
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
  .text-primary { color:var(--primary); }
  .badge { padding:4px 8px; border-radius:4px; font-size:.75rem; font-weight:600; text-transform:uppercase; }
  .badge-success   { background:rgba(40,167,69,.1);   color:var(--success); }
  .badge-primary   { background:rgba(67,94,190,.1);   color:var(--primary); }
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
  .badge-warning   { background:rgba(255,193,7,.1);   color:#d39e00; }
</style>
