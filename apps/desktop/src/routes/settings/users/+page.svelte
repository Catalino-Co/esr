<script>
  import { onMount } from 'svelte';
  import { validateUserInput } from '@esr/schemas';
  import { Modal } from '@esr/ui';

  let viewState = "1";
  let users = [];
  let showModal = false;
  let isEditing = false;
  
  let currentUser = {
    id: null,
    username: '',
    password: '',
    name: '',
    role: 'admin'
  };

  async function loadData() {
    if (window.api && window.api.db) {
      let query = "SELECT id, username, name, role FROM users WHERE is_active = ? ORDER BY name ASC";
      users = await window.api.db.get(query, [parseInt(viewState)]);
    }
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentUser = { id: null, username: '', password: '', name: '', role: 'admin' };
    showModal = true;
  }

  function openEdit(u) {
    isEditing = true;
    currentUser = { ...u, password: '' }; // Don't fill password on edit for security
    showModal = true;
  }

  async function saveUser() {
    if (!validateUserInput(currentUser, { isEditing }).valid) {
      alert("Usuario, nombre y contraseña son requeridos.");
      return;
    }

    if (isEditing) {
      await window.api.users.update(currentUser);
    } else {
      await window.api.users.create(currentUser);
    }
    
    showModal = false;
    loadData();
  }

  async function changeState(id, newState) {
    // Prevent modifying oneself
    const session = JSON.parse(sessionStorage.getItem('esr_user') || '{}');
    if (session.id === id) {
      alert("No puedes modificar el estado de tu propio usuario en sesión.");
      return;
    }

    let msg = newState === 0 ? "¿Archivar este usuario? Perderá el acceso al sistema." 
            : newState === 1 ? "¿Restaurar este usuario a Activo?"
            : "¿Marcar usuario como inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE users SET is_active = ? WHERE id = ?", [newState, id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="display: flex; align-items: center; gap: 10px;">
    <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
    <span>Gestión de Usuarios</span>
    
    <select bind:value={viewState} on:change={loadData} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em; margin-left: 20px;">
      <option value="1">🟢 Activos</option>
      <option value="2">🟠 Inactivos</option>
      <option value="0">📁 Archivados</option>
    </select>
    
    <button class="btn btn-primary" style="margin-left: auto;" on:click={openCreate}>+ Crear Usuario</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nombre Completo</th>
          <th>Usuario (Login)</th>
          <th>Rol</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each users as u}
          <tr>
            <td style="font-weight: 500;">{u.name}</td>
            <td>{u.username}</td>
            <td><span class="badge badge-primary">{u.role}</span></td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(u)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(u.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(u.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(u.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(u.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(u.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay usuarios.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Usuario' : 'Nuevo Usuario'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label for="u-name">Nombre Completo *</label>
      <input id="u-name" type="text" bind:value={currentUser.name} class="form-control" placeholder="Ej. Juan Pérez">
    </div>
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="u-login">Nombre de Usuario (Login) *</label>
        <input id="u-login" type="text" bind:value={currentUser.username} class="form-control" placeholder="jperez">
      </div>
      <div style="flex: 1;">
        <label for="u-pass">Contraseña {isEditing ? '(Déjalo vacío para no cambiar)' : '*'}</label>
        <input id="u-pass" type="password" bind:value={currentUser.password} class="form-control">
      </div>
    </div>
    
    <div>
      <label for="u-role">Rol del Sistema</label>
      <select id="u-role" bind:value={currentUser.role} class="form-control">
        <option value="admin">Administrador Principal</option>
        <option value="operador">Operador (Reservas)</option>
        <option value="almacen">Almacén (Solo Checklist)</option>
      </select>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveUser}>Guardar Usuario</button>
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
