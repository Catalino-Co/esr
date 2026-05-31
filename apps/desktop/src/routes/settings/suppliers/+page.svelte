<script>
  import { onMount } from 'svelte';
  import { Modal } from '@esr/ui';

  let viewState = "1";
  let suppliers = [];
  let showModal = false;
  let isEditing = false;
  
  let currentSupplier = {
    id: null,
    name: '',
    contact: '',
    phone: '',
    email: '',
    service: '',
    notes: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      let query = "SELECT * FROM suppliers WHERE is_active = ? ORDER BY name ASC";
      suppliers = await window.api.db.get(query, [parseInt(viewState)]);
    }
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentSupplier = { id: null, name: '', contact: '', phone: '', email: '', service: '', notes: '' };
    showModal = true;
  }

  function openEdit(sup) {
    isEditing = true;
    currentSupplier = { ...sup };
    showModal = true;
  }

  async function saveSupplier() {
    if (!currentSupplier.name) {
      alert("El nombre de la empresa es obligatorio");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE suppliers SET name=?, contact=?, phone=?, email=?, service=?, notes=? WHERE id=?`, 
        [currentSupplier.name, currentSupplier.contact, currentSupplier.phone, currentSupplier.email, currentSupplier.service, currentSupplier.notes, currentSupplier.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO suppliers (name, contact, phone, email, service, notes) VALUES (?, ?, ?, ?, ?, ?)`,
        [currentSupplier.name, currentSupplier.contact, currentSupplier.phone, currentSupplier.email, currentSupplier.service, currentSupplier.notes]
      );
    }
    
    showModal = false;
    loadData();
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este suplidor?" 
            : newState === 1 ? "¿Restaurar este suplidor?"
            : "¿Marcar suplidor como inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE suppliers SET is_active = ? WHERE id = ?", [newState, id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center; justify-content: space-between; display: flex; width: 100%;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
      <span>Suplidores / Proveedores</span>
      <select bind:value={viewState} on:change={loadData} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em; margin-left:10px;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Nuevo Suplidor</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Empresa</th>
          <th>Servicio Principal</th>
          <th>Contacto</th>
          <th>Teléfono</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each suppliers as s}
          <tr>
            <td style="font-weight: 500;">{s.name}</td>
            <td><span class="badge badge-info">{s.service || 'General'}</span></td>
            <td>{s.contact || '-'}</td>
            <td>{s.phone || '-'}</td>
            <td>
              <button class="btn-icon" on:click={() => openEdit(s)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(s.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(s.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(s.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(s.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(s.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay suplidores registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Suplidor' : 'Nuevo Suplidor'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label for="sup-name">Nombre de la Empresa *</label>
      <input id="sup-name" type="text" bind:value={currentSupplier.name} class="form-control">
    </div>
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="sup-contact">Persona de Contacto</label>
        <input id="sup-contact" type="text" bind:value={currentSupplier.contact} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="sup-phone">Teléfono</label>
        <input id="sup-phone" type="text" bind:value={currentSupplier.phone} class="form-control">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="sup-email">Correo Electrónico</label>
        <input id="sup-email" type="email" bind:value={currentSupplier.email} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="sup-service">Servicio o Producto Brindado</label>
        <input id="sup-service" type="text" bind:value={currentSupplier.service} class="form-control" placeholder="Ej. Sub-alquiler Sonido">
      </div>
    </div>
    
    <div>
      <label for="sup-notes">Notas Importantes</label>
      <textarea id="sup-notes" bind:value={currentSupplier.notes} class="form-control" rows="2"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveSupplier}>Guardar</button>
  </div>
</Modal>

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-info { background-color: rgba(23, 162, 184, 0.1); color: var(--info); }
</style>
