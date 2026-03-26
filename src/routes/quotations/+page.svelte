<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import PdfPreviewModal from '$lib/components/PdfPreviewModal.svelte';
  import { fmt } from '$lib/utils/format';

  let showPdfPreview = false;
  let pdfPreviewUrl = "";
  let pdfPreviewFilename = "";

  let viewState = "1";
  let quotations = [];
  let clients = [];
  let events = []; // Ideally linked to clients, but we don't have Events CRUD fully active yet.
                   // We will just let them type an event name or leave it empty for now, or link to events later.
                   
  let availableItems = [];
  let availablePackages = [];

  let showModal = false;
  let isEditing = false;
  
  let currentQuotation = {
    id: null,
    client_id: '',
    event_id: null,
    date: new Date().toISOString().split('T')[0],
    validity_days: 15,
    subtotal: 0,
    discount: 0,
    total: 0,
    status: 'borrador',
    notes: '',
    conditions: '50% para reserva. 50% restante antes del evento.'
  };

  let quoteItems = [];
  // quoteItems schema: { is_package: boolean, id: item/pkg_id, name: string, quantity: number, price: number, total: number }

  // Quick add selectors
  let selectedItemId = '';
  let selectedPackageId = '';

  async function loadData() {
    if (window.api && window.api.db) {
      clients = await window.api.db.get("SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC");
      availableItems = await window.api.db.get("SELECT id, name, internal_code, rental_price FROM items WHERE is_active = 1 ORDER BY name ASC");
      availablePackages = await window.api.db.get("SELECT id, name, suggested_price FROM packages WHERE is_active = 1 ORDER BY name ASC");
      loadQuotations();
    }
  }

  async function loadQuotations() {
    let query = `
      SELECT q.*, c.name as client_name 
      FROM quotations q
      LEFT JOIN clients c ON q.client_id = c.id
      WHERE q.is_active = ?
      ORDER BY q.id DESC
    `;
    quotations = await window.api.db.get(query, [parseInt(viewState)]);
  }

  async function loadQuoteItems(quoteId) {
    let query = `
      SELECT qi.*, i.name as item_name, p.name as package_name
      FROM quotation_items qi
      LEFT JOIN items i ON qi.item_id = i.id
      LEFT JOIN packages p ON qi.package_id = p.id
      WHERE qi.quotation_id = ?
    `;
    const rows = await window.api.db.get(query, [quoteId]);
    quoteItems = rows.map(r => {
      let is_pkg = r.package_id != null;
      return {
        is_package: is_pkg,
        id: is_pkg ? r.package_id : r.item_id,
        name: is_pkg ? r.package_name : r.item_name,
        quantity: r.quantity,
        price: r.price,
        total: r.quantity * r.price,
        db_id: r.id
      };
    });
    calculateTotals();
  }

  onMount(() => {
    loadData();
  });

  function addItemToQuote() {
    if (!selectedItemId) return;
    const item = availableItems.find(i => i.id == selectedItemId);
    quoteItems = [...quoteItems, {
      is_package: false,
      id: item.id,
      name: item.name,
      quantity: 1,
      price: item.rental_price || 0,
      total: item.rental_price || 0
    }];
    selectedItemId = '';
    calculateTotals();
  }

  function addPackageToQuote() {
    if (!selectedPackageId) return;
    const pkg = availablePackages.find(p => p.id == selectedPackageId);
    quoteItems = [...quoteItems, {
      is_package: true,
      id: pkg.id,
      name: `[PAQUETE] ${pkg.name}`,
      quantity: 1,
      price: pkg.suggested_price || 0,
      total: pkg.suggested_price || 0
    }];
    selectedPackageId = '';
    calculateTotals();
  }

  function removeQuoteItem(index) {
    quoteItems.splice(index, 1);
    quoteItems = [...quoteItems];
    calculateTotals();
  }

  function updateItemTotal(index) {
    quoteItems[index].total = quoteItems[index].quantity * quoteItems[index].price;
    quoteItems = [...quoteItems];
    calculateTotals();
  }

  function calculateTotals() {
    currentQuotation.subtotal = quoteItems.reduce((acc, item) => acc + item.total, 0);
    currentQuotation.total = currentQuotation.subtotal - currentQuotation.discount;
  }

  function openCreate() {
    isEditing = false;
    currentQuotation = {
      id: null, client_id: '', event_id: null, date: new Date().toISOString().split('T')[0],
      validity_days: 15, subtotal: 0, discount: 0, total: 0, status: 'borrador', notes: '', 
      conditions: '50% para reserva. 50% restante antes del evento.'
    };
    quoteItems = [];
    showModal = true;
  }

  async function openEdit(quotation) {
    isEditing = true;
    currentQuotation = { ...quotation };
    await loadQuoteItems(quotation.id);
    showModal = true;
  }

  async function saveQuotation() {
    if (!currentQuotation.client_id) {
      alert("Seleccione un cliente para la cotización.");
      return;
    }

    calculateTotals();

    if (isEditing) {
      await window.api.db.run(`
        UPDATE quotations SET 
          client_id=?, date=?, validity_days=?, subtotal=?, discount=?, total=?, status=?, notes=?, conditions=?
        WHERE id=?`, 
        [currentQuotation.client_id, currentQuotation.date, currentQuotation.validity_days, 
         currentQuotation.subtotal, currentQuotation.discount, currentQuotation.total, 
         currentQuotation.status, currentQuotation.notes, currentQuotation.conditions, currentQuotation.id]
      );
      
      await window.api.db.run(`DELETE FROM quotation_items WHERE quotation_id=?`, [currentQuotation.id]);
      
      for (const qi of quoteItems) {
        if (qi.is_package) {
          await window.api.db.run(`INSERT INTO quotation_items (quotation_id, package_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [currentQuotation.id, qi.id, qi.quantity, qi.price]);
        } else {
          await window.api.db.run(`INSERT INTO quotation_items (quotation_id, item_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [currentQuotation.id, qi.id, qi.quantity, qi.price]);
        }
      }
    } else {
      const res = await window.api.db.run(`
        INSERT INTO quotations (client_id, date, validity_days, subtotal, discount, total, status, notes, conditions) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentQuotation.client_id, currentQuotation.date, currentQuotation.validity_days, 
         currentQuotation.subtotal, currentQuotation.discount, currentQuotation.total, 
         currentQuotation.status, currentQuotation.notes, currentQuotation.conditions]
      );
      
      const newId = res.id;
      for (const qi of quoteItems) {
        if (qi.is_package) {
          await window.api.db.run(`INSERT INTO quotation_items (quotation_id, package_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [newId, qi.id, qi.quantity, qi.price]);
        } else {
          await window.api.db.run(`INSERT INTO quotation_items (quotation_id, item_id, quantity, price) VALUES (?, ?, ?, ?)`, 
            [newId, qi.id, qi.quantity, qi.price]);
        }
      }
    }
    
    showModal = false;
    loadQuotations();
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE quotations SET status = ? WHERE id = ?", [newStatus, id]);
    loadQuotations();
  }

  function getStatusBadgeClass(status) {
    switch(status) {
      case 'aprobada': return 'badge-success';
      case 'borrador': return 'badge-secondary';
      case 'enviada': return 'badge-info';
      case 'rechazada':
      case 'vencida': return 'badge-danger';
      default: return 'badge-primary';
    }
  }

  import { generateQuotationPDF } from '$lib/utils/pdfGenerator';

  // To be implemented: PDF generation
  async function generatePDF(quote) {
    // We need to fetch the items for this quote immediately to pass them to the PDF generator.
    let query = `
      SELECT qi.*, i.name as item_name, p.name as package_name
      FROM quotation_items qi
      LEFT JOIN items i ON qi.item_id = i.id
      LEFT JOIN packages p ON qi.package_id = p.id
      WHERE qi.quotation_id = ?
    `;
    const rows = await window.api.db.get(query, [quote.id]);
    const items = rows.map(r => ({
      name: r.package_id != null ? `[PAQUETE] ${r.package_name}` : r.item_name,
      quantity: r.quantity,
      price: r.price,
      total: r.quantity * r.price
    }));
    
    // We also might want the client details like document and phone if we query them 
    const c = await window.api.db.getOne("SELECT document_id, phone FROM clients WHERE id=?", [quote.client_id]);
    if(c) {
      quote.client_document = c.document_id;
      quote.client_phone = c.phone;
    }

    const companyData = await window.api.db.get("SELECT * FROM company_info WHERE id = 1");
    const company = companyData && companyData.length > 0 ? companyData[0] : null;

    const { url, filename } = generateQuotationPDF(quote, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    showPdfPreview = true;
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar esta cotización?" 
            : newState === 1 ? "¿Restaurar esta cotización?"
            : "¿Marcar cotización como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE quotations SET is_active = ? WHERE id = ?", [newState, id]);
      loadQuotations();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Historial de Cotizaciones</span>
      <select bind:value={viewState} on:change={loadQuotations} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Crear Cotización</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Total</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each quotations as quote}
          <tr>
            <td style="font-weight: 500;">#{String(quote.id).padStart(5, '0')}</td>
            <td>{quote.client_name}</td>
            <td>{quote.date}</td>
            <td style="font-weight: bold;">${fmt(quote.total)}</td>
            <td>
              <span class="badge {getStatusBadgeClass(quote.status)}">{quote.status.toUpperCase()}</span>
            </td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(quote)}>✏️</button>
              <button class="btn-icon" title="Imprimir PDF" on:click={() => generatePDF(quote)}>🖨️</button>
              {#if quote.status === 'borrador' && viewState === '1'}
                <button class="btn-icon text-success" title="Marcar Aprobada" on:click={() => changeStatus(quote.id, 'aprobada')}>✔️</button>
              {/if}
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(quote.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(quote.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(quote.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(quote.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(quote.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay cotizaciones registradas.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? `Editar Cotización #${currentQuotation.id}` : 'Nueva Cotización'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="qt-client">Cliente *</label>
        <select id="qt-client" class="form-control" bind:value={currentQuotation.client_id}>
          <option value="">Seleccione un cliente...</option>
          {#each clients as client}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="qt-date">Fecha</label>
        <input id="qt-date" type="date" bind:value={currentQuotation.date} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="qt-validity">Validez (Días)</label>
        <input id="qt-validity" type="number" bind:value={currentQuotation.validity_days} class="form-control">
      </div>
    </div>
    
    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 0;">
    
    <label style="color: var(--text-main); font-weight: 600;">Agregar a la cotización:</label>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1; display: flex; gap: 5px;">
        <select aria-label="Añadir ítem individual" class="form-control" bind:value={selectedItemId}>
          <option value="">+ Ítem individual</option>
          {#each availableItems as item}
            <option value={item.id}>{item.name}</option>
          {/each}
        </select>
        <button class="btn btn-secondary" on:click={addItemToQuote}>Add</button>
      </div>
      <div style="flex: 1; display: flex; gap: 5px;">
        <select aria-label="Añadir paquete" class="form-control" bind:value={selectedPackageId}>
          <option value="">+ Paquete</option>
          {#each availablePackages as pkg}
            <option value={pkg.id}>{pkg.name}</option>
          {/each}
        </select>
        <button class="btn btn-secondary" on:click={addPackageToQuote}>Add</button>
      </div>
    </div>

    <!-- Items Table -->
    <div class="table-wrapper" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table class="table" style="margin: 0;">
        <thead style="background: var(--bg-color); position: sticky; top: 0;">
          <tr>
            <th>Concepto</th>
            <th style="width: 80px;">Cant.</th>
            <th style="width: 100px;">Precio</th>
            <th style="width: 100px;">Total</th>
            <th style="width: 40px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each quoteItems as qItem, i}
            <tr>
              <td>{qItem.name}</td>
              <td><input aria-label="Cantidad" type="number" class="form-control" style="padding: 4px;" bind:value={qItem.quantity} on:input={() => updateItemTotal(i)} min="1"></td>
              <td><input aria-label="Precio" type="number" class="form-control" style="padding: 4px;" step="0.01" bind:value={qItem.price} on:input={() => updateItemTotal(i)}></td>
              <td style="font-weight: 500;">${fmt(qItem.total)}</td>
              <td><button class="btn-icon text-danger" on:click={() => removeQuoteItem(i)}>🗑️</button></td>
            </tr>
          {/each}
          {#if quoteItems.length === 0}
            <tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 10px;">La cotización está vacía.</td></tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div style="align-self: flex-end; width: 250px; background: var(--bg-color); padding: 15px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
        <span style="color: var(--text-muted);">Subtotal:</span>
        <span style="font-weight: 500;">${fmt(currentQuotation.subtotal)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
        <span style="color: var(--text-muted);">Descuento:</span>
        <input type="number" class="form-control" style="width: 80px; padding: 2px 5px;" bind:value={currentQuotation.discount} on:input={calculateTotals}>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 1.2rem; font-weight: 700; color: var(--primary); margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 10px;">
        <span>Total:</span>
        <span>${fmt(currentQuotation.total)}</span>
      </div>
    </div>

    <!-- Details -->
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="qt-notes">Observaciones (Internas)</label>
        <textarea id="qt-notes" bind:value={currentQuotation.notes} class="form-control" rows="2"></textarea>
      </div>
      <div style="flex: 1;">
        <label for="qt-cond">Condiciones (Visibles en PDF)</label>
        <textarea id="qt-cond" bind:value={currentQuotation.conditions} class="form-control" rows="2"></textarea>
      </div>
    </div>

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveQuotation}>Guardar Cotización</button>
  </div>
</Modal>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl} filename={pdfPreviewFilename} title="Vista Previa de Cotización" />

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .text-success { color: var(--success); }
  .badge-secondary { background-color: rgba(108, 117, 125, 0.1); color: var(--secondary); }
  .badge-info { background-color: rgba(23, 162, 184, 0.1); color: var(--info); }
</style>
