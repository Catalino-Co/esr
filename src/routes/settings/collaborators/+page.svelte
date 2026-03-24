<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

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
      let query = "SELECT * FROM collaborators WHERE is_active = 1 ORDER BY name ASC";
      collaborators = await window.api.db.get(query);
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

  async function deactivateCollaborator(id) {
    if (confirm("¿Desactivar/Eliminar este colaborador?")) {
      await window.api.db.run("UPDATE collaborators SET is_active = 0 WHERE id = ?", [id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
    <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
    <span>Colaboradores (Staff)</span>
    <button class="btn btn-primary" style="margin-left: auto;" on:click={openCreate}>+ Nuevo Colaborador</button>
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
              <button class="btn-icon text-danger" on:click={() => deactivateCollaborator(c.id)}>❌</button>
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
      <label>Nombre Completo *</label>
      <input type="text" bind:value={currentPerson.name} class="form-control">
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label>Teléfono</label>
        <input type="text" bind:value={currentPerson.phone} class="form-control">
      </div>
      <div style="flex: 1;">
        <label>Correo Electrónico</label>
        <input type="email" bind:value={currentPerson.email} class="form-control">
      </div>
    </div>
    <div>
      <label>Rol / Especialidad</label>
      <select bind:value={currentPerson.role} class="form-control">
        <option value="">(Ninguno Especificado)</option>
        <option value="Montador">Montador</option>
        <option value="Chofer">Chofer</option>
        <option value="Técnico de Sonido">Técnico de Sonido</option>
        <option value="Técnico de Luces">Técnico de Iluminación</option>
        <option value="Coordinador">Coordinador de Evento</option>
      </select>
    </div>
    <div>
      <label>Observaciones</label>
      <textarea bind:value={currentPerson.notes} class="form-control" rows="2"></textarea>
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
