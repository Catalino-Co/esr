<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  let woId = null;
  let workOrder = null;
  let clientName = '';
  let checklistItems = [];
  
  // Tabs: 'salida' or 'retorno'
  let activeTab = 'salida';

  async function loadData() {
    woId = $page.url.searchParams.get('wo');
    if (!woId || !window.api || !window.api.db) return;

    // Load work order
    const woQuery = `
      SELECT w.*, c.name as client_name 
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.id = ?
    `;
    workOrder = await window.api.db.getOne(woQuery, [woId]);
    if (workOrder) {
      clientName = workOrder.client_name;
    }

    await loadChecklist();
  }

  async function loadChecklist() {
    // We synchronize the checklist with the work_order_items.
    // If work_order_checklists doesn't have an entry for an item, we create a default one in memory.
    
    // First, get all items for this WO
    let itemsQuery = `
      SELECT wi.item_id, wi.quantity as expected_quantity, i.name as item_name, i.internal_code
      FROM work_order_items wi
      JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?
    `;
    const woItems = await window.api.db.get(itemsQuery, [woId]);

    // Then, get saved checklist state for the active tab (salida/retorno)
    let savedChecklistQuery = `
      SELECT * FROM work_order_checklists
      WHERE work_order_id = ? AND type = ?
    `;
    const saved = await window.api.db.get(savedChecklistQuery, [woId, activeTab]);
    
    // Merge
    checklistItems = woItems.map(wi => {
      const existing = saved.find(s => s.item_id === wi.item_id);
      return {
        item_id: wi.item_id,
        item_name: wi.item_name,
        internal_code: wi.internal_code,
        expected_quantity: wi.expected_quantity,
        actual_quantity: existing ? existing.actual_quantity : (activeTab === 'salida' ? wi.expected_quantity : 0),
        is_damaged: existing ? (existing.is_damaged === 1) : false,
        is_missing: existing ? (existing.is_missing === 1) : false,
        notes: existing ? existing.notes : ''
      };
    });
  }

  onMount(() => {
    loadData();
  });

  async function switchTab(tab) {
    await saveChecklistLocally(); // save current before switching
    activeTab = tab;
    await loadChecklist();
  }

  async function saveChecklistLocally() {
    if (!woId || !window.api) return;

    // Remove old for this specific type to insert fresh ones
    await window.api.db.run(`DELETE FROM work_order_checklists WHERE work_order_id = ? AND type = ?`, [woId, activeTab]);

    for (const item of checklistItems) {
      await window.api.db.run(`
        INSERT INTO work_order_checklists (work_order_id, item_id, type, expected_quantity, actual_quantity, is_damaged, is_missing, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [woId, item.item_id, activeTab, item.expected_quantity, item.actual_quantity, item.is_damaged ? 1 : 0, item.is_missing ? 1 : 0, item.notes || '']
      );
    }
  }

  async function saveAndReturn() {
    await saveChecklistLocally();
    alert(`Checklist de ${activeTab} guardado correctamente.`);
    window.location.href = '/work_orders';
  }

  // Quick fill buttons
  function fillAll() {
    checklistItems = checklistItems.map(i => ({...i, actual_quantity: i.expected_quantity}));
  }
  function clearAll() {
    checklistItems = checklistItems.map(i => ({...i, actual_quantity: 0}));
  }

</script>

<div class="card">
  <div class="card-title" style="display: flex; align-items: center; gap: 15px;">
    <a href="/work_orders" class="btn btn-secondary" style="text-decoration: none;">← Volver</a>
    <span>Checklist de Operación</span>
  </div>

  {#if workOrder}
    <div style="background: rgba(67, 94, 190, 0.05); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between;">
        <div>
          <h3 style="margin: 0; color: var(--primary);">WO-{String(woId).padStart(5,'0')}</h3>
          <p style="margin: 5px 0 0 0; color: var(--text-muted);">Cliente: <strong style="color: var(--text-main);">{clientName}</strong></p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: var(--text-muted);">Fecha: <strong style="color: var(--text-main);">{workOrder.date}</strong></p>
          <p style="margin: 5px 0 0 0; color: var(--text-muted);">Estado: <strong style="color: var(--text-main);">{workOrder.status.toUpperCase()}</strong></p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display: flex; border-bottom: 2px solid var(--border-color); margin-bottom: 20px;">
      <button class="tab-btn {activeTab === 'salida' ? 'active' : ''}" on:click={() => switchTab('salida')}>🚛 Checklist de Salida (Carga)</button>
      <button class="tab-btn {activeTab === 'retorno' ? 'active' : ''}" on:click={() => switchTab('retorno')}>🏢 Checklist de Retorno (Descarga)</button>
    </div>

    <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
      <h4 style="margin: 0;">Equipos a verificar:</h4>
      <div style="display: flex; gap: 10px;">
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" on:click={fillAll}>Llenar Todos</button>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" on:click={clearAll}>Limpiar</button>
      </div>
    </div>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Código / Ítem</th>
            <th style="width: 100px; text-align: center;">Requerido</th>
            <th style="width: 120px; text-align: center;">Verificado</th>
            {#if activeTab === 'retorno'}
              <th style="width: 80px; text-align: center;">Daño</th>
              <th style="width: 80px; text-align: center;">Faltante</th>
            {/if}
            <th>Observación</th>
          </tr>
        </thead>
        <tbody>
          {#each checklistItems as item}
            <tr style="background: {item.actual_quantity === item.expected_quantity && !item.is_damaged && !item.is_missing ? 'rgba(40, 167, 69, 0.05)' : (item.is_damaged || item.is_missing ? 'rgba(220, 53, 69, 0.05)' : 'transparent')}">
              <td>
                <span style="font-size: 0.8rem; color: var(--text-muted);">{item.internal_code}</span><br>
                <strong>{item.item_name}</strong>
              </td>
              <td style="text-align: center; font-size: 1.2rem;">{item.expected_quantity}</td>
              <td style="text-align: center;">
                <input type="number" class="form-control" style="text-align: center;" bind:value={item.actual_quantity} min="0" max={item.expected_quantity}>
              </td>
              {#if activeTab === 'retorno'}
                <td style="text-align: center;">
                  <input type="checkbox" bind:checked={item.is_damaged} style="transform: scale(1.5);">
                </td>
                <td style="text-align: center;">
                  <input type="checkbox" bind:checked={item.is_missing} style="transform: scale(1.5);">
                </td>
              {/if}
              <td>
                <input type="text" class="form-control" bind:value={item.notes} placeholder="Nota (opcional)...">
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 20px; display: flex; justify-content: flex-end;">
      <button class="btn btn-primary" style="font-size: 1.1rem; padding: 10px 30px;" on:click={saveAndReturn}>Guardar Checklist</button>
    </div>

  {:else}
    <div style="padding: 50px; text-align: center; color: var(--text-muted);">
      <p>Cargando información de la orden o no se proporcionó ID válido.</p>
    </div>
  {/if}
</div>

<style>
  .tab-btn {
    background: none;
    border: none;
    padding: 15px 20px;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }
  .tab-btn:hover {
    color: var(--text-main);
  }
  .tab-btn.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
  }
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
</style>
