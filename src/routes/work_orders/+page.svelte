<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PdfPreviewModal from '$lib/components/PdfPreviewModal.svelte';

  let showPdfPreview = false;
  let pdfPreviewUrl = "";
  let pdfPreviewFilename = "";
  let pdfPreviewTitle = "";

  let viewState = "1";
  let workOrders = [];
  let clients = [];
  let events = [];
  let quotations = [];
  let availableItems = [];

  let showModal = false;
  let isEditing = false;
  
  let currentWO = {
    id: null,
    client_id: '',
    event_id: '',
    quotation_id: '',
    date: new Date().toISOString().split('T')[0],
    responsible_person: '',
    vehicle: '',
    notes: '',
    status: 'pendiente'
  };

  let woItems = [];
  let selectedItemId = '';
  let selectedItemQty = 1;

  async function loadData() {
    if (window.api && window.api.db) {
      clients = await window.api.db.get("SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC");
      availableItems = await window.api.db.get("SELECT id, name, internal_code FROM items WHERE is_active = 1 ORDER BY name ASC");
      quotations = await window.api.db.get("SELECT id, total FROM quotations WHERE status = 'aprobada' AND is_active = 1 ORDER BY id DESC");
      loadWorkOrders();
    }
  }

  async function loadWorkOrders() {
    let query = `
      SELECT w.*, c.name as client_name 
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.is_active = ?
      ORDER BY w.id DESC
    `;
    workOrders = await window.api.db.get(query, [parseInt(viewState)]);
  }

  async function loadWOItems(woId) {
    let query = `
      SELECT wi.*, i.name as item_name, i.internal_code
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?
    `;
    const rows = await window.api.db.get(query, [woId]);
    woItems = rows.map(r => ({
      item_id: r.item_id,
      name: r.item_name,
      internal_code: r.internal_code,
      quantity: r.quantity
    }));
  }

  onMount(() => {
    loadData();
  });

  async function importFromQuotation() {
    if (!currentWO.quotation_id) return;
    
    // Fetch quotation details
    const quote = await window.api.db.getOne("SELECT client_id, event_id, date FROM quotations WHERE id = ?", [currentWO.quotation_id]);
    if (quote) {
      currentWO.client_id = quote.client_id;
      currentWO.date = quote.date;
      currentWO.event_id = quote.event_id || '';
    }

    // Fetch quotation items, expand packages
    let query = `
      SELECT qi.item_id, qi.package_id, qi.quantity 
      FROM quotation_items qi
      WHERE qi.quotation_id = ?
    `;
    const items = await window.api.db.get(query, [currentWO.quotation_id]);
    
    woItems = []; // Reset
    
    for (const item of items) {
      if (item.package_id) {
        // Expand package
        const pkgItems = await window.api.db.get(`
          SELECT pi.item_id, pi.quantity, i.name, i.internal_code 
          FROM package_items pi 
          JOIN items i ON pi.item_id = i.id 
          WHERE pi.package_id = ?`, [item.package_id]
        );
        for (const pi of pkgItems) {
          addOrUpdateWOItem(pi.item_id, pi.name, pi.internal_code, pi.quantity * item.quantity);
        }
      } else if (item.item_id) {
        const iDef = await window.api.db.getOne("SELECT name, internal_code FROM items WHERE id = ?", [item.item_id]);
        if (iDef) addOrUpdateWOItem(item.item_id, iDef.name, iDef.internal_code, item.quantity);
      }
    }
  }

  function addOrUpdateWOItem(id, name, code, qty) {
    const existing = woItems.find(w => w.item_id === id);
    if (existing) {
      existing.quantity += qty;
    } else {
      woItems.push({ item_id: id, name, internal_code: code, quantity: qty });
    }
    woItems = [...woItems];
  }

  function addItemToWO() {
    if (!selectedItemId || selectedItemQty < 1) return;
    const item = availableItems.find(i => i.id == selectedItemId);
    addOrUpdateWOItem(item.id, item.name, item.internal_code, selectedItemQty);
    selectedItemId = '';
    selectedItemQty = 1;
  }

  function removeWOItem(index) {
    woItems.splice(index, 1);
    woItems = [...woItems];
  }

  function openCreate() {
    isEditing = false;
    currentWO = {
      id: null, client_id: '', event_id: '', quotation_id: '',
      date: new Date().toISOString().split('T')[0], responsible_person: '',
      vehicle: '', notes: '', status: 'pendiente'
    };
    woItems = [];
    showModal = true;
  }

  async function openEdit(wo) {
    isEditing = true;
    currentWO = { ...wo };
    await loadWOItems(wo.id);
    showModal = true;
  }

  async function saveWorkOrder() {
    if (!currentWO.client_id) {
      alert("Seleccione un cliente para la orden de trabajo.");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE work_orders SET 
          client_id=?, event_id=?, quotation_id=?, date=?, responsible_person=?, vehicle=?, notes=?, status=?
        WHERE id=?`, 
        [currentWO.client_id, currentWO.event_id || null, currentWO.quotation_id || null, currentWO.date, 
         currentWO.responsible_person, currentWO.vehicle, currentWO.notes, currentWO.status, currentWO.id]
      );
      
      await window.api.db.run(`DELETE FROM work_order_items WHERE work_order_id=?`, [currentWO.id]);
      
      for (const wi of woItems) {
        await window.api.db.run(`INSERT INTO work_order_items (work_order_id, item_id, quantity) VALUES (?, ?, ?)`, 
          [currentWO.id, wi.item_id, wi.quantity]);
      }
    } else {
      const res = await window.api.db.run(`
        INSERT INTO work_orders (client_id, event_id, quotation_id, date, responsible_person, vehicle, notes, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentWO.client_id, currentWO.event_id || null, currentWO.quotation_id || null, currentWO.date, 
         currentWO.responsible_person, currentWO.vehicle, currentWO.notes, currentWO.status]
      );
      
      const newId = res.id;
      for (const wi of woItems) {
        await window.api.db.run(`INSERT INTO work_order_items (work_order_id, item_id, quantity) VALUES (?, ?, ?)`, 
          [newId, wi.item_id, wi.quantity]);
      }
    }
    
    showModal = false;
    loadWorkOrders();
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE work_orders SET status = ? WHERE id = ?", [newStatus, id]);
    loadWorkOrders();
  }

  function getStatusBadgeClass(status) {
    switch(status) {
      case 'entregado': 
      case 'cerrado': return 'badge-success';
      case 'pendiente': return 'badge-secondary';
      case 'preparado': 
      case 'cargado': return 'badge-info';
      case 'en recogida':
      case 'retornado': return 'badge-primary';
      default: return 'badge-warning';
    }
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar esta orden de trabajo?" 
            : newState === 1 ? "¿Restaurar esta orden de trabajo?"
            : "¿Marcar orden de trabajo como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE work_orders SET is_active = ? WHERE id = ?", [newState, id]);
      loadWorkOrders();
    }
  }
  import { generateWorkOrderPDF, generateConducePDF } from '$lib/utils/pdfGenerator';

  async function printWO(wo) {
    const items = await window.api.db.get(`
      SELECT wi.*, i.name, i.internal_code
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]
    );
    // Include client info
    const c = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [wo.client_id]);
    if(c) {
      wo.client_document = c.document_id;
      wo.client_phone = c.phone;
    }
    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData && companyData.length > 0 ? companyData[0] : null;
    const { url, filename } = generateWorkOrderPDF(wo, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle = `Vista Previa - Orden de Trabajo WO-${String(wo.id).padStart(5, '0')}`;
    showPdfPreview = true;
  }

  async function printConduce(wo) {
    const items = await window.api.db.get(`
      SELECT wi.*, i.name, i.internal_code
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]
    );
    const c = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [wo.client_id]);
    if(c) {
      wo.client_document = c.document_id;
      wo.client_phone = c.phone;
    }
    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData && companyData.length > 0 ? companyData[0] : null;
    const { url, filename } = generateConducePDF(wo, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle = `Vista Previa - Conduce WO-${String(wo.id).padStart(5, '0')}`;
    showPdfPreview = true;
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Órdenes de Trabajo (Operaciones)</span>
      <select bind:value={viewState} on:change={loadWorkOrders} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Crear Orden de Trabajo</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Cliente</th>
          <th>Fecha Operación</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each workOrders as wo}
          <tr>
            <td style="font-weight: 500;">WO-{String(wo.id).padStart(5, '0')}</td>
            <td>{wo.client_name}</td>
            <td>{wo.date}</td>
            <td>
              <span class="badge {getStatusBadgeClass(wo.status)}">{wo.status.toUpperCase()}</span>
            </td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(wo)}>✏️</button>
              <button class="btn-icon" title="Imprimir WO" on:click={() => printWO(wo)}>🖨️</button>
              <button class="btn-icon text-primary" title="Generar Conduce" on:click={() => printConduce(wo)}>📝</button>
              <a href={`/checklist?wo=${wo.id}`} class="btn-icon" title="Checklist Salida/Retorno" style="text-decoration: none;">📋</a>
              
              {#if viewState === '1'}
                {#if wo.status === 'pendiente'}
                  <button class="btn-icon text-info" title="Marcar Preparado" on:click={() => changeStatus(wo.id, 'preparado')}>📦</button>
                {:else if wo.status === 'preparado'}
                  <button class="btn-icon text-info" title="Marcar Cargado" on:click={() => changeStatus(wo.id, 'cargado')}>🚛</button>
                {:else if wo.status === 'cargado'}
                  <button class="btn-icon text-success" title="Marcar Entregado" on:click={() => changeStatus(wo.id, 'entregado')}>✅</button>
                {:else if wo.status === 'entregado'}
                  <button class="btn-icon text-warning" title="En Recogida" on:click={() => changeStatus(wo.id, 'en recogida')}>↩️</button>
                {:else if wo.status === 'en recogida'}
                  <button class="btn-icon text-primary" title="Retornado (Checklist pendiente)" on:click={() => changeStatus(wo.id, 'retornado')}>🏢</button>
                {/if}
              {/if}

              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(wo.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(wo.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(wo.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(wo.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(wo.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay órdenes de trabajo abiertas.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? `Editar Orden de Trabajo WO-${currentWO.id}` : 'Nueva Orden de Trabajo'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    
    {#if !isEditing}
    <div style="background: rgba(67, 94, 190, 0.05); padding: 15px; border-radius: 8px; border: 1px dashed var(--primary);">
      <label for="wo-qt-import" style="color: var(--primary);">Generar desde Cotización Aprobada (Opcional)</label>
      <div style="display: flex; gap: 10px; margin-top: 5px;">
        <select id="wo-qt-import" class="form-control" bind:value={currentWO.quotation_id}>
          <option value="">Seleccione Cotización...</option>
          {#each quotations as qt}
            <option value={qt.id}>Cotización #{String(qt.id).padStart(5,'0')} - ${qt.total.toFixed(2)}</option>
          {/each}
        </select>
        <button class="btn btn-primary" on:click={importFromQuotation} disabled={!currentWO.quotation_id}>Importar Datos</button>
      </div>
    </div>
    {/if}

    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="wo-client">Cliente *</label>
        <select id="wo-client" class="form-control" bind:value={currentWO.client_id}>
          <option value="">Seleccione un cliente...</option>
          {#each clients as client}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="wo-date">Fecha de Operación</label>
        <input id="wo-date" type="date" bind:value={currentWO.date} class="form-control">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="wo-resp">Responsable / Chofer</label>
        <input id="wo-resp" type="text" bind:value={currentWO.responsible_person} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="wo-veh">Vehículo asignado</label>
        <input id="wo-veh" type="text" bind:value={currentWO.vehicle} class="form-control">
      </div>
    </div>
    
    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 0;">
    
    <label for="wo-item-sel" style="color: var(--text-main); font-weight: 600;">Lista de Equipos a Preparar:</label>
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1; display: flex; gap: 5px;">
        <select id="wo-item-sel" class="form-control" bind:value={selectedItemId}>
          <option value="">Buscar ítem en inventario...</option>
          {#each availableItems as item}
            <option value={item.id}>[{item.internal_code}] {item.name}</option>
          {/each}
        </select>
        <input aria-label="Cantidad de Ítem" type="number" min="1" bind:value={selectedItemQty} class="form-control" style="width: 80px;" placeholder="Cant.">
        <button class="btn btn-secondary" on:click={addItemToWO}>Add</button>
      </div>
    </div>

    <!-- Items Table -->
    <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table class="table" style="margin: 0;">
        <thead style="background: var(--bg-color); position: sticky; top: 0;">
          <tr>
            <th>Código</th>
            <th>Ítem</th>
            <th style="width: 80px;">Cant.</th>
            <th style="width: 40px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each woItems as wItem, i}
            <tr>
              <td><span style="font-size: 0.8rem; color: var(--text-muted);">{wItem.internal_code}</span></td>
              <td>{wItem.name}</td>
              <td style="font-weight: bold;">{wItem.quantity}</td>
              <td><button class="btn-icon text-danger" on:click={() => removeWOItem(i)}>🗑️</button></td>
            </tr>
          {/each}
          {#if woItems.length === 0}
            <tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 10px;">No hay equipos asignados a la orden.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    <div>
      <label for="wo-notes">Instrucciones de Montaje / Observaciones</label>
      <textarea id="wo-notes" bind:value={currentWO.notes} class="form-control" rows="2"></textarea>
    </div>

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveWorkOrder}>Guardar Orden de Trabajo</button>
  </div>
</Modal>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl} filename={pdfPreviewFilename} title={pdfPreviewTitle} />

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .text-info { color: var(--info); }
  .text-primary { color: var(--primary); }
  .text-warning { color: var(--warning); }
  .text-success { color: var(--success); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-secondary { background-color: rgba(108, 117, 125, 0.1); color: var(--secondary); }
  .badge-info { background-color: rgba(23, 162, 184, 0.1); color: var(--info); }
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
  .badge-warning { background-color: rgba(255, 193, 7, 0.1); color: #d39e00; }
  .badge-success { background-color: rgba(40, 167, 69, 0.1); color: var(--success); }
</style>
