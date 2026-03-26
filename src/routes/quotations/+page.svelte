<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { generateQuotationPDF } from '$lib/utils/pdfGenerator';
  import PdfPreviewModal from '$lib/components/PdfPreviewModal.svelte';
  import { fmt } from '$lib/utils/format';

  let viewState = "1";
  let quotations = [];
  let showPdfPreview = false;
  let pdfPreviewUrl = "";
  let pdfPreviewFilename = "";

  async function loadQuotations() {
    if (!window.api?.db) return;
    quotations = await window.api.db.get(`
      SELECT q.*, c.name as client_name
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.is_active = ?
      ORDER BY q.id DESC
    `, [parseInt(viewState)]);
  }

  onMount(() => loadQuotations());

  function getStatusBadgeClass(status) {
    switch (status) {
      case 'aprobada':  return 'badge-success';
      case 'borrador':  return 'badge-secondary';
      case 'enviada':   return 'badge-info';
      case 'rechazada':
      case 'vencida':   return 'badge-danger';
      default:          return 'badge-primary';
    }
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE quotations SET status = ? WHERE id = ?", [newStatus, id]);
    loadQuotations();
  }

  async function changeState(id, newState) {
    const msg = newState === 0 ? "¿Archivar esta cotización?"
              : newState === 1 ? "¿Restaurar esta cotización?"
              : "¿Marcar cotización como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE quotations SET is_active = ? WHERE id = ?", [newState, id]);
      loadQuotations();
    }
  }

  async function generatePDF(quote) {
    const rows = await window.api.db.get(`
      SELECT qi.*, i.name as item_name, p.name as package_name
      FROM quotation_items qi
      LEFT JOIN items i ON qi.item_id = i.id
      LEFT JOIN packages p ON qi.package_id = p.id
      WHERE qi.quotation_id = ?`, [quote.id]);

    const items = rows.map(r => ({
      name:     r.package_id != null ? `[PAQUETE] ${r.package_name}` : r.item_name,
      quantity: r.quantity,
      price:    r.price,
      total:    r.quantity * r.price
    }));

    const c = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [quote.client_id]);
    if (c) { quote.client_document = c.document_id; quote.client_phone = c.phone; }

    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData?.[0] ?? null;

    const { url, filename } = generateQuotationPDF(quote, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    showPdfPreview = true;
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Historial de Cotizaciones</span>
      <select bind:value={viewState} on:change={loadQuotations}
        style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={() => goto('/quotations/edit')}>+ Crear Cotización</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nº</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Validez</th>
          <th>Total</th>
          <th>Estado</th>
          <th style="text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each quotations as quote}
          <tr>
            <td style="font-weight: 600; color: var(--primary);">
              #{String(quote.id).padStart(5, '0')}
            </td>
            <td style="font-weight: 500;">{quote.client_name || '—'}</td>
            <td>{quote.date}</td>
            <td style="color: var(--text-muted);">{quote.validity_days} días</td>
            <td style="font-weight: 700;">${fmt(quote.total)}</td>
            <td>
              <span class="badge {getStatusBadgeClass(quote.status)}">
                {quote.status.toUpperCase()}
              </span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar / Ver"
                      on:click={() => goto(`/quotations/edit?id=${quote.id}`)}>✏️</button>
              <button class="btn-icon" title="Generar PDF"
                      on:click={() => generatePDF(quote)}>🖨️</button>
              {#if quote.status === 'borrador' && viewState === '1'}
                <button class="btn-icon text-success" title="Aprobar"
                        on:click={() => changeStatus(quote.id, 'aprobada')}>✔️</button>
              {/if}
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar"
                        on:click={() => changeState(quote.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger"  title="Archivar"
                        on:click={() => changeState(quote.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar"
                        on:click={() => changeState(quote.id, 1)}>▶️</button>
                <button class="btn-icon text-danger"  title="Archivar"
                        on:click={() => changeState(quote.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar"
                        on:click={() => changeState(quote.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">
              No hay cotizaciones registradas.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFilename} title="Vista Previa de Cotización" />

<style>
  .btn-icon { background:none; border:none; cursor:pointer; padding:4px 5px; opacity:0.6; transition:0.2s; }
  .btn-icon:hover { opacity:1; transform:scale(1.1); }
  .text-danger  { color: var(--danger); }
  .text-warning { color: var(--warning); }
  .text-success { color: var(--success); }
  .badge { padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; text-transform:uppercase; }
  .badge-success   { background:rgba(40,167,69,.1);   color:var(--success); }
  .badge-secondary { background:rgba(108,117,125,.1); color:var(--secondary); }
  .badge-info      { background:rgba(23,162,184,.1);  color:var(--info); }
  .badge-danger    { background:rgba(220,53,69,.1);   color:var(--danger); }
  .badge-primary   { background:rgba(67,94,190,.1);   color:var(--primary); }
</style>
