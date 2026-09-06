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

  let viewState = "1";
  let busqueda = '';
  let eventTypes = [];
  let showModal = false;
  let isEditing = false;
  let recargando = false;

  let currentType = { id: null, name: '', color: '#6366f1', description: '' };

  async function loadData() {
    if (window.api && window.api.db) {
      const where = ['is_active = ?'];
      const params = [parseInt(viewState)];
      if (busqueda.trim()) {
        where.push('(name LIKE ?)');
        params.push(`%${busqueda.trim()}%`);
      }
      eventTypes = await window.api.db.get(
        `SELECT * FROM event_types WHERE ${where.join(' AND ')} ORDER BY name ASC`,
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
    currentType = { id: null, name: '', color: '#6366f1', description: '' };
    showModal = true;
  }

  function openEdit(type) {
    isEditing = true;
    currentType = { ...type, color: type.color || '#6366f1', description: type.description || '' };
    showModal = true;
  }

  async function saveType() {
    if (!currentType.name.trim()) {
      dangerModal.show("El nombre es obligatorio");
      return;
    }
    try {
      if (isEditing) {
        try {
          await window.api.db.run(
            `UPDATE event_types SET name=?, color=?, description=? WHERE id=?`,
            [currentType.name.trim(), currentType.color, currentType.description || null, currentType.id]
          );
        } catch {
          await window.api.db.run(
            `UPDATE event_types SET name=? WHERE id=?`,
            [currentType.name.trim(), currentType.id]
          );
        }
      } else {
        try {
          await window.api.db.run(
            `INSERT INTO event_types (name, color, description) VALUES (?, ?, ?)`,
            [currentType.name.trim(), currentType.color, currentType.description || null]
          );
        } catch {
          await window.api.db.run(
            `INSERT INTO event_types (name) VALUES (?)`,
            [currentType.name.trim()]
          );
        }
      }
      showModal = false;
      loadData();
    } catch (err) {
      dangerModal.show("Ocurrió un error. Verifica que el nombre no esté duplicado.");
    }
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este tipo de evento?"
            : newState === 1 ? "¿Restaurar este tipo de evento?"
            : "¿Marcar tipo de evento como inactivo?";
    if (await confirmDialog.ask(msg)) {
      await window.api.db.run("UPDATE event_types SET is_active = ? WHERE id = ?", [newState, id]);
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
  <FilterBar
    search={{ placeholder: 'Buscar por nombre…', value: busqueda }}
    onSearch={(v) => { busqueda = v; loadData(); }}
  />

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th style="width: 36px;"></th>
          <th style="width: 220px;">Nombre del Tipo de Evento</th>
          <th>Descripción</th>
          <th style="width: 96px; text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each eventTypes as t}
          <tr>
            <td style="padding: 0 0 0 8px;">
              <div class="color-dot" style="background: {t.color || '#6366f1'};"></div>
            </td>
            <td>
              <span class="type-pill" style="border-left: 3px solid {t.color || '#6366f1'}; background: {t.color || '#6366f1'}18;">
                {t.name}
              </span>
            </td>
            <td style="color: var(--text-muted); font-size: 0.88rem;">{t.description || '—'}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar" on:click={() => openEdit(t)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon" title="Inactivar" on:click={() => changeState(t.id, 2)}>⏸️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeState(t.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon" title="Activar" on:click={() => changeState(t.id, 1)}>▶️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeState(t.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar" on:click={() => changeState(t.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay tipos de eventos registrados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Tipo de Evento' : 'Nuevo Tipo de Evento'} maxWidth="480px">
  <div style="display: flex; flex-direction: column; gap: 16px;">

    <div>
      <label for="event-type-name">Nombre *</label>
      <input id="event-type-name" type="text" bind:value={currentType.name} class="form-control" placeholder="Ej. Boda, Corporativo, Concierto...">
    </div>

    <div>
      <label>Color identificador</label>
      <div class="color-row">
        <input type="color" class="color-input" bind:value={currentType.color} />
        <div class="color-preview" style="border-left: 4px solid {currentType.color}; background: {currentType.color}18;">
          <span style="color: {currentType.color}; font-weight: 600;">{currentType.name || 'Vista previa'}</span>
        </div>
      </div>
    </div>

    <div>
      <label for="event-type-desc">Descripción <span style="font-weight: 400; opacity: 0.7;">(opcional)</span></label>
      <textarea id="event-type-desc" bind:value={currentType.description} class="form-control" rows="2" placeholder="Breve descripción del tipo de evento..."></textarea>
    </div>

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveType}>Guardar</button>
  </div>
</Modal>

<style>
  .color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }
  .type-pill {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 4px;
    font-weight: 500;
    font-size: 0.9rem;
  }
  .color-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .color-input {
    width: 48px;
    height: 38px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 2px;
    cursor: pointer;
    background: white;
  }
  .color-preview {
    flex: 1;
    padding: 8px 14px;
    border-radius: 6px;
    border: 1px solid var(--border-color);
    font-size: 0.9rem;
    min-height: 38px;
    display: flex;
    align-items: center;
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
