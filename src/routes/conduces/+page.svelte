<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { generateConducePDF } from '$lib/utils/pdfGenerator';
  import PdfPreviewModal from '$lib/components/PdfPreviewModal.svelte';

  let showPdfPreview = false;
  let pdfPreviewUrl = "";
  let pdfPreviewFilename = "";
  let pdfPreviewTitle = "";

  let viewState = "1";
  let conduces = [];
  let workOrders = [];
  
  let showModal = false;
  let isEditing = false;
  
  let currentConduce = {
    id: null,
    work_order_id: '',
    client_id: '',
    date: new Date().toISOString().split('T')[0],
    status: 'emitido',
    driver_or_vehicle: '',
    notes: '',
    subtotal: 0,
    discount: 0,
    total: 0
  };

  let conduceItems = [];

  async function loadData() {
    if (window.api && window.api.db) {
      loadConduces();
      workOrders = await window.api.db.get(`
        SELECT w.id, w.client_id, c.name as client_name, w.date
        FROM work_orders w
        LEFT JOIN clients c ON w.client_id = c.id
        WHERE w.is_active = 1
        ORDER BY w.id DESC
      `);
    }
  }

  async function loadConduces() {
    let query = `
      SELECT c.*, cl.name as client_name 
      FROM conduces c
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.is_active = ?
      ORDER BY c.id DESC
    `;
    conduces = await window.api.db.get(query, [parseInt(viewState)]);
  }

  onMount(() => {
    loadData();
  });

  async function importFromWorkOrder() {
    if (!currentConduce.work_order_id) return;
    
    const wo = workOrders.find(w => w.id === currentConduce.work_order_id);
    if (wo) {
      currentConduce.client_id = wo.client_id;
    }

    let query = `
      SELECT wi.item_id, wi.quantity, i.name, i.internal_code, i.rental_price as price
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?
    `;
    const items = await window.api.db.get(query, [currentConduce.work_order_id]);
    
    conduceItems = items.map(i => ({
      item_id: i.item_id,
      name: i.name,
      internal_code: i.internal_code,
      quantity: i.quantity,
      price: i.price || 0,
      total: i.quantity * (i.price || 0)
    }));
    calculateTotals();
  }

  function updateItemTotal(index) {
    conduceItems[index].total = conduceItems[index].quantity * conduceItems[index].price;
    conduceItems = [...conduceItems];
    calculateTotals();
  }

  function calculateTotals() {
    currentConduce.subtotal = conduceItems.reduce((acc, item) => acc + item.total, 0);
    currentConduce.total = currentConduce.subtotal - currentConduce.discount;
  }

  function removeConduceItem(index) {
    conduceItems.splice(index, 1);
    conduceItems = [...conduceItems];
    calculateTotals();
  }

  function openCreate() {
    isEditing = false;
    currentConduce = {
      id: null, work_order_id: '', client_id: '',
      date: new Date().toISOString().split('T')[0], status: 'emitido',
      driver_or_vehicle: '', notes: '', subtotal: 0, discount: 0, total: 0
    };
    conduceItems = [];
    showModal = true;
  }

  async function openEdit(cond) {
    isEditing = true;
    currentConduce = { ...cond };
    
    let query = `
      SELECT ci.item_id, ci.quantity, ci.price, i.name, i.internal_code
      FROM conduce_items ci
      JOIN items i ON ci.item_id = i.id
      WHERE ci.conduce_id = ?
    `;
    const items = await window.api.db.get(query, [cond.id]);
    conduceItems = items.map(i => ({
      item_id: i.item_id,
      name: i.name,
      internal_code: i.internal_code,
      quantity: i.quantity,
      price: i.price || 0,
      total: i.quantity * (i.price || 0)
    }));
    
    showModal = true;
  }

  async function saveConduce() {
    if (!currentConduce.work_order_id) {
      alert("Seleccione una Orden de Trabajo para el Conduce.");
      return;
    }

    calculateTotals();

    if (isEditing) {
      await window.api.db.run(`
        UPDATE conduces SET 
          work_order_id=?, client_id=?, date=?, status=?, driver_or_vehicle=?, notes=?, subtotal=?, discount=?, total=?
        WHERE id=?`, 
        [currentConduce.work_order_id, currentConduce.client_id, currentConduce.date, 
         currentConduce.status, currentConduce.driver_or_vehicle, currentConduce.notes,
         currentConduce.subtotal, currentConduce.discount, currentConduce.total, currentConduce.id]
      );
      
      await window.api.db.run(`DELETE FROM conduce_items WHERE conduce_id=?`, [currentConduce.id]);
      
      for (const ci of conduceItems) {
        if(ci.quantity > 0) {
          await window.api.db.run(`INSERT INTO conduce_items (conduce_id, item_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [currentConduce.id, ci.item_id, ci.quantity, ci.price]);
        }
      }
    } else {
      const res = await window.api.db.run(`
        INSERT INTO conduces (work_order_id, client_id, date, status, driver_or_vehicle, notes, subtotal, discount, total) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentConduce.work_order_id, currentConduce.client_id, currentConduce.date, 
         currentConduce.status, currentConduce.driver_or_vehicle, currentConduce.notes,
         currentConduce.subtotal, currentConduce.discount, currentConduce.total]
      );
      
      const newId = res.id;
      for (const ci of conduceItems) {
        if(ci.quantity > 0) {
          await window.api.db.run(`INSERT INTO conduce_items (conduce_id, item_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [newId, ci.item_id, ci.quantity, ci.price]);
        }
      }
    }
    
    showModal = false;
    loadConduces();
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE conduces SET status = ? WHERE id = ?", [newStatus, id]);
    loadConduces();
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este Conduce?" 
            : newState === 1 ? "¿Restaurar este Conduce?"
            : "¿Marcar Conduce como inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE conduces SET is_active = ? WHERE id = ?", [newState, id]);
      loadConduces();
    }
  }

  function getStatusBadgeClass(status) {
    switch(status) {
      case 'entregado': return 'badge-success';
      case 'emitido': return 'badge-primary';
      case 'anulado': return 'badge-secondary';
      default: return 'badge-warning';
    }
  }

  async function printConduce(cond) {
    const items = await window.api.db.get(`
      SELECT ci.*, i.name, i.internal_code
      FROM conduce_items ci
      JOIN items i ON ci.item_id = i.id
      WHERE ci.conduce_id = ?`, [cond.id]
    );

    const printObj = {
      ...cond,
      id: cond.work_order_id,
      conduce_id: cond.id,
      client_name: cond.client_name,
      subtotal: cond.subtotal,
      discount: cond.discount,
      total: cond.total
    };

    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData && companyData.length > 0 ? companyData[0] : null;

    const { url, filename } = generateConducePDF(printObj, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle = `Vista Previa - Conduce COND-${String(cond.id).padStart(5, '0')}`;
    showPdfPreview = true;
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Conduces (Notas de Entrega)</span>
      <select bind:value={viewState} on:change={loadConduces} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Crear Conduce</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Conduce #</th>
          <th>WO Referencia</th>
          <th>Cliente</th>
          <th>Fecha Emisión</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each conduces as c}
          <tr>
            <td style="font-weight: 500;">COND-{String(c.id).padStart(5, '0')}</td>
            <td>WO-{String(c.work_order_id).padStart(5, '0')}</td>
            <td>{c.client_name || '-'}</td>
            <td>{c.date}</td>
            <td>
              <span class="badge {getStatusBadgeClass(c.status)}">{c.status.toUpperCase()}</span>
            </td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(c)}>✏️</button>
              <button class="btn-icon text-primary" title="Imprimir Conduce" on:click={() => printConduce(c)}>🖨️</button>
              
              {#if c.status === 'emitido' && viewState === '1'}
                <button class="btn-icon text-success" title="Marcar Entregado" on:click={() => changeStatus(c.id, 'entregado')}>✅</button>
              {/if}

              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(c.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(c.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(c.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(c.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(c.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay conduces generados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? `Editar Conduce COND-${currentConduce.id}` : 'Nuevo Conduce'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    
    {#if !isEditing}
    <div style="background: rgba(67, 94, 190, 0.05); padding: 15px; border-radius: 8px; border: 1px dashed var(--primary);">
      <label for="cond-wo">Seleccionar Orden de Trabajo Origen</label>
      <div style="display: flex; gap: 10px; margin-top: 5px;">
        <select id="cond-wo" class="form-control" bind:value={currentConduce.work_order_id}>
          <option value="">Seleccione WO...</option>
          {#each workOrders as wo}
            <option value={wo.id}>WO-{String(wo.id).padStart(5,'0')} - {wo.client_name || 'Sin Cliente'} ({wo.date})</option>
          {/each}
        </select>
        <button class="btn btn-primary" on:click={importFromWorkOrder} disabled={!currentConduce.work_order_id}>Cargar Equipos</button>
      </div>
    </div>
    {/if}

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="cond-date">Fecha de Emisión</label>
        <input id="cond-date" type="date" bind:value={currentConduce.date} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="cond-driver">Chofer / Vehículo</label>
        <input id="cond-driver" type="text" bind:value={currentConduce.driver_or_vehicle} class="form-control" placeholder="Ej. Juan (Ficha 04)">
      </div>
    </div>
    
    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 0;">
    
    <label style="color: var(--text-main); font-weight: 600;">Artículos a Entregar:</label>

    <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table class="table" style="margin: 0;">
        <thead style="background: var(--bg-color); position: sticky; top: 0;">
          <tr>
            <th>Código</th>
            <th>Ítem</th>
            <th style="width: 80px;">Cant.</th>
            <th style="width: 100px;">Precio</th>
            <th style="width: 100px;">Total</th>
            <th style="width: 40px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each conduceItems as cItem, i}
            <tr>
              <td><span style="font-size: 0.8rem; color: var(--text-muted);">{cItem.internal_code}</span></td>
              <td>{cItem.name}</td>
              <td style="font-weight: bold;">
                <input aria-label="Cantidad" type="number" min="0" bind:value={cItem.quantity} on:input={() => updateItemTotal(i)} class="form-control" style="padding: 4px; height: 30px;">
              </td>
              <td>
                <input aria-label="Precio" type="number" step="0.01" bind:value={cItem.price} on:input={() => updateItemTotal(i)} class="form-control" style="padding: 4px; height: 30px;">
              </td>
              <td style="font-weight: 500;">${cItem.total.toFixed(2)}</td>
              <td><button class="btn-icon text-danger" on:click={() => removeConduceItem(i)}>🗑️</button></td>
            </tr>
          {/each}
          {#if conduceItems.length === 0}
            <tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 10px;">No hay equipos. Cargue desde una WO.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="align-self: flex-end; width: 250px; background: var(--bg-color); padding: 15px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span style="color: var(--text-muted);">Subtotal:</span>
        <span style="font-weight: 500;">${currentConduce.subtotal.toFixed(2)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
        <span style="color: var(--text-muted);">Descuento:</span>
        <input type="number" class="form-control" style="width: 80px; padding: 2px 5px;" bind:value={currentConduce.discount} on:input={calculateTotals}>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: 700; color: var(--primary); margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px;">
        <span>Total:</span>
        <span>${currentConduce.total.toFixed(2)}</span>
      </div>
    </div>

    <div>
      <label for="cond-notes">Notas / Observaciones del Conduce</label>
      <textarea id="cond-notes" bind:value={currentConduce.notes} class="form-control" rows="2"></textarea>
    </div>

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveConduce}>Guardar Conduce</button>
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
  .text-primary { color: var(--primary); }
  .text-success { color: var(--success); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-secondary { background-color: rgba(108, 117, 125, 0.1); color: var(--secondary); }
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
  .badge-warning { background-color: rgba(255, 193, 7, 0.1); color: #d39e00; }
  .badge-success { background-color: rgba(40, 167, 69, 0.1); color: var(--success); }
</style>
