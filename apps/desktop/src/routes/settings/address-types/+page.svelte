<script>
  import { onMount } from 'svelte';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';
  import { Icon, Modal } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';

  const ESTADOS = [
    { value: '1', label: 'Activos', tone: 'ok' },
    { value: '2', label: 'Inactivos', tone: 'warn' },
    { value: '0', label: 'Archivados', tone: 'off' }
  ];

  /**
   * Tipos de Dirección. Misma forma que los demas catalogos de Ajustes: tres
   * estados (activo / inactivo / archivado), sin borrado, porque hay registros
   * que apuntan a estas filas por id.
   */
  let viewState = '1';
  let busqueda = '';
  let entries = [];
  let showModal = false;
  let isEditing = false;
  let recargando = false;

  let current = { id: null, name: '', description: '' };

  async function loadData() {
    if (window.api && window.api.db) {
      const where = ['is_active = ?'];
      const params = [parseInt(viewState)];
      if (busqueda.trim()) {
        where.push('(name LIKE ?)');
        params.push(`%${busqueda.trim()}%`);
      }
      entries = await window.api.db.get(
        `SELECT * FROM client_address_types WHERE ${where.join(' AND ')} ORDER BY name ASC`,
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

  onMount(() => loadData());

  function openCreate() {
    isEditing = false;
    current = { id: null, name: '', description: '' };
    showModal = true;
  }

  function openEdit(entry) {
    isEditing = true;
    current = { ...entry, description: entry.description || '' };
    showModal = true;
  }

  async function save() {
    if (!current.name.trim()) {
      dangerModal.show('El nombre es obligatorio');
      return;
    }
    try {
      if (isEditing) {
        await window.api.db.run(
          'UPDATE client_address_types SET name = ?, description = ? WHERE id = ?',
          [current.name.trim(), current.description || null, current.id]
        );
      } else {
        await window.api.db.run(
          'INSERT INTO client_address_types (name, description) VALUES (?, ?)',
          [current.name.trim(), current.description || null]
        );
      }
      showModal = false;
      loadData();
    } catch {
      // El indice unico sobre el nombre normalizado es la barrera real.
      dangerModal.show('Ocurrió un error. Verifica que el nombre no esté duplicado.');
    }
  }

  async function changeState(id, newState) {
    const msg =
      newState === 0
        ? '¿Archivar esta entrada?'
        : newState === 1
          ? '¿Restaurar esta entrada?'
          : '¿Marcar esta entrada como inactiva?';
    if (await confirmDialog.ask(msg)) {
      await window.api.db.run('UPDATE client_address_types SET is_active = ? WHERE id = ?', [newState, id]);
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
    <button class="btn btn-primary btn-new" on:click={openCreate}>+ Nuevo Tipo</button>
  </div>
</div>

<div class="card">
  <p class="hint">Clasifican las direcciones de servicio del cliente: dónde se entrega o se monta.</p>

  <FilterBar
    search={{ placeholder: 'Buscar por nombre…', value: busqueda }}
    onSearch={(v) => { busqueda = v; loadData(); }}
  />

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th style="width: 260px;">Nombre</th>
          <th>Descripción</th>
          <th style="width: 96px; text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as entry}
          <tr>
            <td style="font-weight: 500;">{entry.name}</td>
            <td style="color: var(--text-muted); font-size: 0.88rem;">{entry.description || '—'}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar" on:click={() => openEdit(entry)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon" title="Inactivar" on:click={() => changeState(entry.id, 2)}>⏸️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeState(entry.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon" title="Activar" on:click={() => changeState(entry.id, 1)}>▶️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeState(entry.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar" on:click={() => changeState(entry.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay tipos de dirección registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar entrada' : 'Nuevo Tipo de Dirección'} maxWidth="480px">
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div>
      <label for="cat-name">Nombre *</label>
      <input id="cat-name" type="text" bind:value={current.name} class="form-control" placeholder="Ej. Sucursal, Almacén, Obra..." />
    </div>
    <div>
      <label for="cat-desc">Descripción <span style="font-weight: 400; opacity: 0.7;">(opcional)</span></label>
      <textarea id="cat-desc" bind:value={current.description} class="form-control" rows="2"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => (showModal = false)}><Icon name="x" size={16} />Cancelar</button>
    <button class="btn btn-primary" on:click={save}><Icon name="check" size={16} />Guardar</button>
  </div>
</Modal>

<style>
  .hint {
    margin: 0 0 12px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }
  .form-control {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    box-sizing: border-box;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
  }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 4px 5px; opacity: 0.6; transition: 0.2s; }
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
</style>
