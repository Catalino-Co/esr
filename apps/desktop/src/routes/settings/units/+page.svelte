<script>
  import { onMount } from 'svelte';
  import { Modal } from '@esr/ui';

  /**
   * Unidades de medida. Como se cuenta cada articulo.
   *
   * `abbr` es lo que se pinta junto a la cantidad en el inventario: «120 ud».
   *
   * Misma forma que los demas catalogos de Ajustes: tres estados (activo /
   * inactivo / archivado), sin borrado, porque hay registros que apuntan a
   * estas filas por id.
   */
  let viewState = '1';
  let entries = [];
  let showModal = false;
  let isEditing = false;

  let current = { id: null, name: '', abbr: '' };

  async function loadData() {
    if (window.api && window.api.db) {
      entries = await window.api.db.get(
        'SELECT * FROM units_of_measure WHERE is_active = ? ORDER BY name ASC',
        [parseInt(viewState)]
      );
    }
  }

  onMount(() => loadData());

  function openCreate() {
    isEditing = false;
    current = { id: null, name: '', abbr: '' };
    showModal = true;
  }

  function openEdit(entry) {
    isEditing = true;
    current = { ...entry, abbr: entry.abbr || '' };
    showModal = true;
  }

  async function save() {
    if (!current.name.trim()) {
      alert('El nombre es obligatorio');
      return;
    }
    try {
      if (isEditing) {
        await window.api.db.run('UPDATE units_of_measure SET name = ?, abbr = ? WHERE id = ?', [
          current.name.trim(),
          current.abbr || null,
          current.id
        ]);
      } else {
        await window.api.db.run('INSERT INTO units_of_measure (name, abbr) VALUES (?, ?)', [
          current.name.trim(),
          current.abbr || null
        ]);
      }
      showModal = false;
      loadData();
    } catch {
      alert('Ocurrió un error. Verifica que el nombre no esté duplicado.');
    }
  }

  async function changeState(id, newState) {
    const msg =
      newState === 0
        ? '¿Archivar esta entrada?'
        : newState === 1
          ? '¿Restaurar esta entrada?'
          : '¿Marcar esta entrada como inactiva?';
    if (confirm(msg)) {
      await window.api.db.run('UPDATE units_of_measure SET is_active = ? WHERE id = ?', [newState, id]);
      loadData();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center; justify-content: space-between; display: flex; width: 100%;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <a href="/settings" class="btn-icon" style="font-size: 1.2rem; text-decoration: none;" title="Volver a Ajustes">⬅️</a>
      <span>Unidades de Medida</span>
      <select bind:value={viewState} on:change={loadData} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em; margin-left: 10px;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Nueva Unidad</button>
  </div>

  <p class="hint">Cómo se cuenta cada artículo. La abreviatura es lo que acompaña a la cantidad en el inventario: «120 ud».</p>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th style="width: 260px;">Nombre</th>
          <th>Abreviatura</th>
          <th style="width: 96px; text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each entries as entry}
          <tr>
            <td style="font-weight: 500;">{entry.name}</td>
            <td style="color: var(--text-muted);">{entry.abbr || '—'}</td>
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
            <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay unidades registradas.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar entrada' : 'Nueva Unidad'} maxWidth="480px">
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div>
      <label for="uom-name">Nombre *</label>
      <input id="uom-name" type="text" bind:value={current.name} class="form-control" placeholder="Ej. Unidad, Juego, Metro..." />
    </div>
    <div>
      <label for="uom-abbr">Abreviatura <span style="font-weight: 400; opacity: 0.7;">(opcional)</span></label>
      <input id="uom-abbr" type="text" bind:value={current.abbr} class="form-control" placeholder="ud" />
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => (showModal = false)}>Cancelar</button>
    <button class="btn btn-primary" on:click={save}>Guardar</button>
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
  .form-control:focus {
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
    padding: 4px 5px;
    opacity: 0.6;
    transition: 0.2s;
  }
  .btn-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }
</style>
