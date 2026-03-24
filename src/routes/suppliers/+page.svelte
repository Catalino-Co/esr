<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

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
      let query = "SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC";
      suppliers = await window.api.db.get(query);
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

  async function deactivateSupplier(id) {
    if (confirm("¿Desactivar/Eliminar este suplidor?")) {
      await window.api.db.run("UPDATE suppliers SET is_active = 0 WHERE id = ?", [id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title">
    <span>Suplidores / Proveedores</span>
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
              <button class="btn-icon text-danger" on:click={() => deactivateSupplier(s.id)}>❌</button>
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
      <label>Nombre de la Empresa *</label>
      <input type="text" bind:value={currentSupplier.name} class="form-control">
    </div>
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label>Persona de Contacto</label>
        <input type="text" bind:value={currentSupplier.contact} class="form-control">
      </div>
      <div style="flex: 1;">
        <label>Teléfono</label>
        <input type="text" bind:value={currentSupplier.phone} class="form-control">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label>Correo Electrónico</label>
        <input type="email" bind:value={currentSupplier.email} class="form-control">
      </div>
      <div style="flex: 1;">
        <label>Servicio o Producto Brindado</label>
        <input type="text" bind:value={currentSupplier.service} class="form-control" placeholder="Ej. Sub-alquiler Sonido">
      </div>
    </div>
    
    <div>
      <label>Notas Importantes</label>
      <textarea bind:value={currentSupplier.notes} class="form-control" rows="2"></textarea>
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
