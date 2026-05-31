<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';
  import { fmt } from '$lib/utils/format';

  let viewState = "1";
  let incidents = [];
  let availableItems = [];
  let clients = [];
  let workOrders = [];

  let showModal = false;
  let isEditing = false;
  
  let currentIncident = {
    id: null,
    type: 'daño',
    item_id: '',
    client_id: '',
    work_order_id: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    severity: 'media',
    estimated_cost: 0,
    status: 'reportado',
    notes: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      availableItems = await window.api.db.get("SELECT id, name, internal_code FROM items WHERE is_active = 1 ORDER BY name ASC");
      clients = await window.api.db.get("SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC");
      workOrders = await window.api.db.get("SELECT id FROM work_orders WHERE is_active = 1 ORDER BY id DESC LIMIT 50");
      loadIncidents();
    }
  }

  async function loadIncidents() {
    let query = `
      SELECT inc.*, i.name as item_name, i.internal_code, c.name as client_name 
      FROM incidents inc
      LEFT JOIN items i ON inc.item_id = i.id
      LEFT JOIN clients c ON inc.client_id = c.id
      WHERE inc.is_active = ?
      ORDER BY inc.id DESC
    `;
    incidents = await window.api.db.get(query, [parseInt(viewState)]);
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentIncident = {
      id: null, type: 'daño', item_id: '', client_id: '', work_order_id: '',
      date: new Date().toISOString().split('T')[0], description: '', severity: 'media',
      estimated_cost: 0, status: 'reportado', notes: ''
    };
    showModal = true;
  }

  function openEdit(inc) {
    isEditing = true;
    currentIncident = { ...inc };
    showModal = true;
  }

  async function saveIncident() {
    if (!currentIncident.item_id) {
      alert("Seleccione el ítem involucrado.");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE incidents SET 
          type=?, item_id=?, client_id=?, work_order_id=?, date=?, description=?, severity=?, estimated_cost=?, status=?, notes=?
        WHERE id=?`, 
        [currentIncident.type, currentIncident.item_id, currentIncident.client_id || null, 
         currentIncident.work_order_id || null, currentIncident.date, currentIncident.description, 
         currentIncident.severity, currentIncident.estimated_cost, currentIncident.status, currentIncident.notes, currentIncident.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO incidents (type, item_id, client_id, work_order_id, date, description, severity, estimated_cost, status, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentIncident.type, currentIncident.item_id, currentIncident.client_id || null, 
         currentIncident.work_order_id || null, currentIncident.date, currentIncident.description, 
         currentIncident.severity, currentIncident.estimated_cost, currentIncident.status, currentIncident.notes]
      );
    }
    
    showModal = false;
    loadIncidents();
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE incidents SET status = ? WHERE id = ?", [newStatus, id]);
    loadIncidents();
  }

  function getStatusBadgeClass(status) {
    switch(status) {
      case 'resuelto': 
      case 'cobrado': return 'badge-success';
      case 'reportado': return 'badge-secondary';
      case 'en reparación': return 'badge-warning';
      case 'pérdida total': return 'badge-danger';
      default: return 'badge-primary';
    }
  }

  function getSeverityColor(sev) {
    if (sev === 'alta') return 'var(--danger)';
    if (sev === 'media') return 'var(--warning)';
    return 'var(--info)';
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este registro de incidencia?" 
            : newState === 1 ? "¿Restaurar este registro de incidencia?"
            : "¿Marcar incidencia como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE incidents SET is_active = ? WHERE id = ?", [newState, id]);
      loadIncidents();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Centro de Incidencias (Daños y Faltantes)</span>
      <select bind:value={viewState} on:change={loadIncidents} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Reportar Incidencia</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Tipo</th>
          <th>Equipo Afectado</th>
          <th>WO / Cliente</th>
          <th>Costo Est.</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each incidents as inc}
          <tr>
            <td style="font-weight: 500;">INC-00{inc.id}</td>
            <td>
              <span style="font-weight: 600; text-transform: capitalize;">{inc.type}</span><br>
              <small style="color: {getSeverityColor(inc.severity)};">Prioridad: {inc.severity}</small>
            </td>
            <td>
              <span style="font-size: 0.8rem; color: var(--text-muted);">{inc.internal_code}</span><br>
              {inc.item_name}
            </td>
            <td>
              {#if inc.work_order_id}WO-{String(inc.work_order_id).padStart(5,'0')}<br>{/if}
              <small style="color: var(--text-muted);">{inc.client_name || 'Sin Asignar'}</small>
            </td>
            <td style="font-weight: bold; color: var(--danger);">${fmt(inc.estimated_cost)}</td>
            <td>
              <span class="badge {getStatusBadgeClass(inc.status)}">{inc.status.toUpperCase()}</span>
            </td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(inc)}>✏️</button>
              
              {#if viewState === '1'}
                {#if inc.status === 'reportado'}
                  <button class="btn-icon text-warning" title="En Reparación" on:click={() => changeStatus(inc.id, 'en reparación')}>🔧</button>
                  <button class="btn-icon text-success" title="Resuelto / Cobrado" on:click={() => changeStatus(inc.id, 'cobrado')}>💰</button>
                {/if}
                {#if inc.status === 'en reparación'}
                  <button class="btn-icon text-success" title="Resuelto" on:click={() => changeStatus(inc.id, 'resuelto')}>✅</button>
                {/if}
              {/if}

              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(inc.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(inc.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(inc.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(inc.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(inc.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">Genial, no hay incidencias reportadas.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? `Editar Incidencia INC-00${currentIncident.id}` : 'Reportar Nueva Incidencia'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="inc-type">Tipo de Incidencia *</label>
        <select id="inc-type" bind:value={currentIncident.type} class="form-control">
          <option value="daño">Daño Estructural / Visual</option>
          <option value="avería">Avería Técnica</option>
          <option value="faltante">Faltante (Retorno Incompleto)</option>
          <option value="pérdida">Pérdida Total</option>
        </select>
      </div>
      <div style="flex: 2;">
        <label for="inc-item">Equipo Afectado *</label>
        <select id="inc-item" class="form-control" bind:value={currentIncident.item_id}>
          <option value="">Seleccione equipo...</option>
          {#each availableItems as item}
            <option value={item.id}>[{item.internal_code}] {item.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="inc-wo">Relacionado a Orden (Opcional)</label>
        <select id="inc-wo" bind:value={currentIncident.work_order_id} class="form-control">
          <option value="">Ninguna</option>
          {#each workOrders as wo}
            <option value={wo.id}>WO-{String(wo.id).padStart(5,'0')}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="inc-client">Cliente (Si aplica)</label>
        <select id="inc-client" bind:value={currentIncident.client_id} class="form-control">
          <option value="">Ninguno</option>
          {#each clients as client}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="inc-severity">Gravedad / Severidad</label>
        <select id="inc-severity" bind:value={currentIncident.severity} class="form-control">
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
        </select>
      </div>
      <div style="flex: 1;">
        <label for="inc-cost">Costo Estimado ($)</label>
        <input id="inc-cost" type="number" step="0.01" bind:value={currentIncident.estimated_cost} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="inc-date">Fecha del Reporte</label>
        <input id="inc-date" type="date" bind:value={currentIncident.date} class="form-control">
      </div>
    </div>

    <div>
      <label for="inc-desc">Descripción del Problema</label>
      <textarea id="inc-desc" bind:value={currentIncident.description} class="form-control" rows="3" placeholder="Detalles de cómo ocurrió el daño o faltante..."></textarea>
    </div>

    <div>
      <label for="inc-notes">Resolución / Notas Internas</label>
      <input id="inc-notes" type="text" bind:value={currentIncident.notes} class="form-control" placeholder="Acciones a tomar...">
    </div>

    {#if isEditing}
    <div>
      <label for="inc-status">Estado Actual</label>
      <select id="inc-status" bind:value={currentIncident.status} class="form-control">
        <option value="reportado">Reportado</option>
        <option value="en reparación">En Reparación</option>
        <option value="cobrado">Cobrado al Cliente</option>
        <option value="resuelto">Resuelto (Sin Cobro)</option>
        <option value="pérdida total">Pérdida Total (Baja de Inventario)</option>
      </select>
    </div>
    {/if}

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveIncident}>Guardar Incidencia</button>
  </div>
</Modal>

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .text-success { color: var(--success); }
  .text-warning { color: var(--warning); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-secondary { background-color: rgba(108, 117, 125, 0.1); color: var(--secondary); }
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
  .badge-warning { background-color: rgba(255, 193, 7, 0.1); color: #d39e00; }
  .badge-success { background-color: rgba(40, 167, 69, 0.1); color: var(--success); }
  .badge-danger { background-color: rgba(220, 53, 69, 0.1); color: var(--danger); }
</style>
