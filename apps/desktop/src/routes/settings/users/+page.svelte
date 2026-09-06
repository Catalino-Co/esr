<script>
  import { onMount } from 'svelte';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';
  import { validateUserInput } from '@esr/schemas';
  import { Icon, Modal } from '@esr/ui';
  import { COMPANY_ROLES, ROLE_DESCRIPTIONS, roleLabel } from '@esr/core';
  import FilterBar from '$lib/components/list/FilterBar.svelte';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  const ESTADOS = [
    { value: '1', label: 'Activos', tone: 'ok' },
    { value: '2', label: 'Inactivos', tone: 'warn' },
    { value: '0', label: 'Archivados', tone: 'off' }
  ];

  let viewState = "1";
  let busqueda = '';
  let users = [];
  let showModal = false;
  let isEditing = false;
  let recargando = false;

  let currentUser = {
    id: null,
    username: '',
    password: '',
    name: '',
    role: 'admin'
  };

  async function loadData() {
    if (window.api && window.api.db) {
      const where = ['is_active = ?'];
      const params = [parseInt(viewState)];
      if (busqueda.trim()) {
        where.push('(name LIKE ? OR username LIKE ?)');
        params.push(`%${busqueda.trim()}%`, `%${busqueda.trim()}%`);
      }
      users = await window.api.db.get(
        `SELECT id, username, name, role FROM users WHERE ${where.join(' AND ')} ORDER BY name ASC`,
        params
      );
    }
  }

  async function recargar() {
    recargando = true;
    try {
      await loadData();
    } finally {
      recargando = false;
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
      dangerModal.show("Usuario, nombre y contraseña son requeridos.");
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
      dangerModal.show("No puedes modificar el estado de tu propio usuario en sesión.");
      return;
    }

    let msg = newState === 0 ? "¿Archivar este usuario? Perderá el acceso al sistema." 
            : newState === 1 ? "¿Restaurar este usuario a Activo?"
            : "¿Marcar usuario como inactivo?";
    if (await confirmDialog.ask(msg)) {
      await window.api.db.run("UPDATE users SET is_active = ? WHERE id = ?", [newState, id]);
      loadData();
    }
  }
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
      <Icon name="back" size={18} />
    </a>
    <button
      type="button"
      class="grupo-btn"
      on:click={recargar}
      disabled={recargando}
      aria-label="Recargar la lista"
      title="Recargar la lista"
    >
      <span class:girando={recargando}><Icon name="refresh" size={18} /></span>
    </button>
  </div>
  <div class="herramientas-datos">
    <StatusSelect
      value={viewState}
      options={ESTADOS}
      label="Estado"
      onchange={(e) => { viewState = e.currentTarget.value; loadData(); }}
    />
    <button class="btn btn-primary btn-new" on:click={openCreate}>+ Crear Usuario</button>
  </div>
</div>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Nombre o usuario…', value: busqueda }}
    onSearch={(v) => { busqueda = v; loadData(); }}
  />

  <div class="table-wrapper">
    <table class="table table--acento">
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
            <td><span class="badge badge-primary">{roleLabel(u.role)}</span></td>
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
      <!-- Los mismos cuatro roles que ESR Cloud, desde `@esr/core`. Antes habia
           una lista propia de tres —admin, operador, almacen— que no coincidia
           con la de Cloud en nada salvo el primero. -->
      <select id="u-role" bind:value={currentUser.role} class="form-control">
        {#each COMPANY_ROLES as rol (rol)}
          <option value={rol}>{roleLabel(rol)}</option>
        {/each}
      </select>
      <small class="rol-nota">{ROLE_DESCRIPTIONS[currentUser.role] ?? ''}</small>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveUser}>Guardar Usuario</button>
  </div>
</Modal>

<style>
  /* La descripcion del rol, debajo del select. */
  .rol-nota {
    display: block;
    margin-top: var(--sp-1);
    font-size: var(--font-xs);
    color: var(--text-muted);
  }

  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
</style>
