<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

  let eventTypes = [];
  let showModal = false;
  let isEditing = false;
  
  let currentType = {
    id: null,
    name: ''
  };

  async function loadData() {
    if (window.api && window.api.db) {
      let query = "SELECT * FROM event_types WHERE is_active = 1 ORDER BY name ASC";
      eventTypes = await window.api.db.get(query);
    }
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentType = { id: null, name: '' };
    showModal = true;
  }

  function openEdit(type) {
    isEditing = true;
    currentType = { ...type };
    showModal = true;
  }

  async function saveType() {
    if (!currentType.name) {
      alert("El nombre es obligatorio");
      return;
    }

    try {
      if (isEditing) {
        await window.api.db.run(`UPDATE event_types SET name=? WHERE id=?`, [currentType.name, currentType.id]);
      } else {
        await window.api.db.run(`INSERT INTO event_types (name) VALUES (?)`, [currentType.name]);
      }
      showModal = false;
      loadData();
    } catch(err) {
      alert("Ocurrió un error. Verifica que el nombre no esté duplicado.");
    }
  }

  async function deactivateType(id) {
    if (confirm("¿Desactivar este tipo de evento?")) {
      await window.api.db.run("UPDATE event_types SET is_active = 0 WHERE id = ?", [id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
    <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
    <span>Tipos de Eventos</span>
    <button class="btn btn-primary" style="margin-left: auto;" on:click={openCreate}>+ Nuevo Tipo</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Nombre del Tipo de Evento</th>
          <th style="width: 100px; text-align: center;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each eventTypes as t}
          <tr>
            <td style="color: var(--text-muted);">#{t.id}</td>
            <td style="font-weight: 500;">{t.name}</td>
            <td style="text-align: center;">
              <button class="btn-icon" on:click={() => openEdit(t)}>✏️</button>
              <button class="btn-icon text-danger" on:click={() => deactivateType(t.id)}>❌</button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay tipos de eventos registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Tipo' : 'Nuevo Tipo'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label>Nombre del Tipo de Evento *</label>
      <input type="text" bind:value={currentType.name} class="form-control" placeholder="Ej. Boda, Corporativo, Concierto...">
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveType}>Guardar</button>
  </div>
</Modal>

<style>
  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
</style>
