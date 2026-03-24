<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

  let clients = [];
  let showModal = false;
  let isEditing = false;
  
  let currentClient = {
    id: null,
    name: '',
    document_id: '',
    phone: '',
    email: '',
    address: '',
    contact_person: '',
    notes: ''
  };

  async function loadClients() {
    if (window.api && window.api.db) {
      clients = await window.api.db.get("SELECT * FROM clients WHERE is_active = 1 ORDER BY name ASC");
    }
  }

  onMount(() => {
    loadClients();
  });

  function openCreate() {
    isEditing = false;
    currentClient = { id: null, name: '', document_id: '', phone: '', email: '', address: '', contact_person: '', notes: '' };
    showModal = true;
  }

  function openEdit(client) {
    isEditing = true;
    currentClient = { ...client };
    showModal = true;
  }

  async function saveClient() {
    if (!currentClient.name) {
      alert("El nombre es obligatorio");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE clients SET 
          name = ?, document_id = ?, phone = ?, email = ?, 
          address = ?, contact_person = ?, notes = ?
        WHERE id = ?`, 
        [currentClient.name, currentClient.document_id, currentClient.phone, currentClient.email, 
         currentClient.address, currentClient.contact_person, currentClient.notes, currentClient.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO clients (name, document_id, phone, email, address, contact_person, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [currentClient.name, currentClient.document_id, currentClient.phone, currentClient.email, 
         currentClient.address, currentClient.contact_person, currentClient.notes]
      );
    }
    showModal = false;
    loadClients();
  }

  async function deactivateClient(id) {
    if (confirm("¿Estás seguro de que deseas eliminar este cliente?")) {
      await window.api.db.run("UPDATE clients SET is_active = 0 WHERE id = ?", [id]);
      loadClients();
    }
  }
</script>

<div class="card">
  <div class="card-title">
    <span>Directorio de Clientes</span>
    <button class="btn btn-primary" on:click={openCreate}>+ Nuevo Cliente</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nombre / Empresa</th>
          <th>Contacto</th>
          <th>Teléfono</th>
          <th>Email</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each clients as client}
          <tr>
            <td style="font-weight: 500;">
              {client.name}
              {#if client.document_id}<div style="font-size: 0.8em; color: var(--text-muted);">ID: {client.document_id}</div>{/if}
            </td>
            <td>{client.contact_person || '-'}</td>
            <td>{client.phone || '-'}</td>
            <td>{client.email || '-'}</td>
            <td>
              <button class="btn" style="padding: 4px; background: transparent; color: var(--primary);" on:click={() => openEdit(client)}>✏️ Editar</button>
              <button class="btn" style="padding: 4px; background: transparent; color: var(--danger);" on:click={() => deactivateClient(client.id)}>❌</button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay clientes registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label>Nombre o Razón Social *</label>
      <input type="text" bind:value={currentClient.name} class="form-control" placeholder="Ej. Eventos SRL">
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label>Cédula / RNC</label>
        <input type="text" bind:value={currentClient.document_id} class="form-control">
      </div>
      <div style="flex: 1;">
        <label>Teléfono</label>
        <input type="text" bind:value={currentClient.phone} class="form-control">
      </div>
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label>Persona Contacto</label>
        <input type="text" bind:value={currentClient.contact_person} class="form-control">
      </div>
      <div style="flex: 1;">
        <label>Email</label>
        <input type="email" bind:value={currentClient.email} class="form-control">
      </div>
    </div>
    <div>
      <label>Dirección</label>
      <input type="text" bind:value={currentClient.address} class="form-control">
    </div>
    <div>
      <label>Observaciones</label>
      <textarea bind:value={currentClient.notes} class="form-control" rows="3"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveClient}>Guardar Cliente</button>
  </div>
</Modal>

<style>
  .form-control {
    width: 100%;
    padding: 10px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: 0.95rem;
    color: var(--text-main);
  }
  .form-control:focus {
    outline: none;
    border-color: var(--primary);
  }
  label {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 5px;
  }
</style>
