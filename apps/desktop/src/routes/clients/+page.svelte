<script>
  import { onMount } from 'svelte';
  import { validateCustomerInput } from '@esr/schemas';
  import Modal from '$lib/components/Modal.svelte';

  let viewState = "1";
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
      clients = await window.api.db.get("SELECT * FROM clients WHERE is_active = ? ORDER BY name ASC", [parseInt(viewState)]);
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
    if (!validateCustomerInput(currentClient).valid) {
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

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este cliente?" 
            : newState === 1 ? "¿Marcar este cliente como Activo?"
            : "¿Marcar este cliente como Inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE clients SET is_active = ? WHERE id = ?", [newState, id]);
      loadClients();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Directorio de Clientes</span>
      <select bind:value={viewState} on:change={loadClients} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
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
              <button class="btn-icon" title="Editar" on:click={() => openEdit(client)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(client.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(client.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(client.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(client.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(client.id, 1)}>🔄</button>
              {/if}
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
      <label for="cli-name">Nombre o Razón Social *</label>
      <input id="cli-name" type="text" bind:value={currentClient.name} class="form-control" placeholder="Ej. Eventos SRL">
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="cli-doc">Cédula / RNC</label>
        <input id="cli-doc" type="text" bind:value={currentClient.document_id} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="cli-phone">Teléfono</label>
        <input id="cli-phone" type="text" bind:value={currentClient.phone} class="form-control">
      </div>
    </div>
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="cli-contact">Persona Contacto</label>
        <input id="cli-contact" type="text" bind:value={currentClient.contact_person} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="cli-email">Email</label>
        <input id="cli-email" type="email" bind:value={currentClient.email} class="form-control">
      </div>
    </div>
    <div>
      <label for="cli-addr">Dirección</label>
      <input id="cli-addr" type="text" bind:value={currentClient.address} class="form-control">
    </div>
    <div>
      <label for="cli-notes">Observaciones</label>
      <textarea id="cli-notes" bind:value={currentClient.notes} class="form-control" rows="3"></textarea>
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
  .btn-icon { 
    background: none; 
    border: none; 
    cursor: pointer; 
    padding: 5px; 
    opacity: 0.6; 
    transition: 0.2s;
    font-size: 1.1rem;
  }
  .btn-icon:hover { 
    opacity: 1; 
    transform: scale(1.1); 
  }
</style>
