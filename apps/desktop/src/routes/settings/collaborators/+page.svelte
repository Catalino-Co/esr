<script>
  import { onMount } from 'svelte';
  import { Modal } from '@esr/ui';

  let viewState = "1";
  let collaborators = [];
  let showModal = false;
  let isEditing = false;
  
  let currentPerson = {
    id: null,
    name: '',
    phone: '',
    email: '',
    role: '',
    notes: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      let query = "SELECT * FROM collaborators WHERE is_active = ? ORDER BY name ASC";
      collaborators = await window.api.db.get(query, [parseInt(viewState)]);
    }
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentPerson = { id: null, name: '', phone: '', email: '', role: '', notes: '' };
    showModal = true;
  }

  function openEdit(person) {
    isEditing = true;
    currentPerson = { ...person };
    showModal = true;
  }

  async function saveCollaborator() {
    if (!currentPerson.name) {
      alert("El nombre es obligatorio");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE collaborators SET name=?, phone=?, email=?, role=?, notes=? WHERE id=?`, 
        [currentPerson.name, currentPerson.phone, currentPerson.email, currentPerson.role, currentPerson.notes, currentPerson.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO collaborators (name, phone, email, role, notes) VALUES (?, ?, ?, ?, ?)`,
        [currentPerson.name, currentPerson.phone, currentPerson.email, currentPerson.role, currentPerson.notes]
      );
    }
    
    showModal = false;
    loadData();
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este colaborador?" 
            : newState === 1 ? "¿Restaurar este colaborador?"
            : "¿Marcar colaborador como inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE collaborators SET is_active = ? WHERE id = ?", [newState, id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center; justify-content: space-between; display: flex; width: 100%;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
      <span>Colaboradores (Staff)</span>
      <select bind:value={viewState} on:change={loadData} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em; margin-left:10px;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Nuevo Colaborador</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Rol / Puesto</th>
          <th>Teléfono</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each collaborators as c}
          <tr>
            <td style="font-weight: 500;">{c.name}</td>
            <td><span class="badge badge-primary">{c.role || 'Staff'}</span></td>
            <td>{c.phone || '-'}</td>
            <td>
              <button class="btn-icon" on:click={() => openEdit(c)}>✏️</button>
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
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay colaboradores registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Colaborador' : 'Nuevo Colaborador'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label for="col-name">Nombre Completo *</label>
      <input id="col-name" type="text" bind:value={currentPerson.name} class="form-control">
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="col-phone">Teléfono</label>
        <input id="col-phone" type="text" bind:value={currentPerson.phone} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="col-email">Correo Electrónico</label>
        <input id="col-email" type="email" bind:value={currentPerson.email} class="form-control">
      </div>
    </div>
    <div>
      <label for="col-role">Rol / Especialidad</label>
      <select id="col-role" bind:value={currentPerson.role} class="form-control">
        <option value="">(Ninguno Especificado)</option>
        <option value="Montador">Montador</option>
        <option value="Chofer">Chofer</option>
        <option value="Técnico de Sonido">Técnico de Sonido</option>
        <option value="Técnico de Luces">Técnico de Iluminación</option>
        <option value="Coordinador">Coordinador de Evento</option>
      </select>
    </div>
    <div>
      <label for="col-notes">Observaciones</label>
      <textarea id="col-notes" bind:value={currentPerson.notes} class="form-control" rows="2"></textarea>
    </div>
  </div>
  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveCollaborator}>Guardar</button>
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
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
</style>
