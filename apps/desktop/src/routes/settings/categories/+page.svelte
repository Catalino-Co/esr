<script>
  import { onMount } from 'svelte';
  import { BackLink } from '@esr/ui';

  let categories = [];
  let subcategories = [];
  let viewState = "1";
  let selectedCategoryId = null;

  // Modal state
  let showCatModal = false;
  let isEditing = false;
  let currentCat = { id: null, name: '', color: '#6366f1' };

  let newSubcatName = '';

  async function loadCategories() {
    if (window.api && window.api.db) {
      categories = await window.api.db.get(
        "SELECT * FROM categories WHERE is_active = ? ORDER BY name ASC",
        [parseInt(viewState)]
      );
    }
  }

  async function loadSubcategories(categoryId) {
    if (window.api && window.api.db && categoryId) {
      subcategories = await window.api.db.get(
        "SELECT * FROM subcategories WHERE category_id = ? AND is_active = ? ORDER BY name ASC",
        [categoryId, parseInt(viewState)]
      );
      selectedCategoryId = categoryId;
    } else {
      subcategories = [];
      selectedCategoryId = null;
    }
  }

  onMount(() => loadCategories());

  function openAddModal() {
    isEditing = false;
    currentCat = { id: null, name: '', color: '#6366f1' };
    showCatModal = true;
  }

  function openEditModal(cat) {
    isEditing = true;
    currentCat = { id: cat.id, name: cat.name, color: cat.color || '#6366f1' };
    showCatModal = true;
  }

  function closeModal() {
    showCatModal = false;
  }

  async function saveCategory() {
    if (!currentCat.name.trim()) return;
    try {
      if (isEditing) {
        // Intentar con color; si falla (columna no existe aún), guardar solo nombre
        try {
          await window.api.db.run(
            "UPDATE categories SET name = ?, color = ? WHERE id = ?",
            [currentCat.name.trim(), currentCat.color, currentCat.id]
          );
        } catch {
          await window.api.db.run(
            "UPDATE categories SET name = ? WHERE id = ?",
            [currentCat.name.trim(), currentCat.id]
          );
        }
      } else {
        try {
          await window.api.db.run(
            "INSERT INTO categories (name, color) VALUES (?, ?)",
            [currentCat.name.trim(), currentCat.color]
          );
        } catch {
          await window.api.db.run(
            "INSERT INTO categories (name) VALUES (?)",
            [currentCat.name.trim()]
          );
        }
      }
      closeModal();
      loadCategories();
    } catch (err) {
      console.error('Error al guardar categoría:', err);
      alert('Error al guardar la categoría.');
    }
  }

  async function addSubcategory() {
    if (!newSubcatName.trim() || !selectedCategoryId) return;
    await window.api.db.run(
      "INSERT INTO subcategories (category_id, name) VALUES (?, ?)",
      [selectedCategoryId, newSubcatName.trim()]
    );
    newSubcatName = '';
    loadSubcategories(selectedCategoryId);
  }

  async function changeCategoryState(id, newState) {
    let msg = newState === 0
      ? "Al archivar la categoría también se archivarán sus subcategorías. ¿Continuar?"
      : newState === 1 ? "¿Restaurar esta categoría y sus subcategorías?"
      : "¿Marcar categoría como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE subcategories SET is_active = ? WHERE category_id = ?", [newState, id]);
      await window.api.db.run("UPDATE categories SET is_active = ? WHERE id = ?", [newState, id]);
      if (selectedCategoryId === id) loadSubcategories(selectedCategoryId);
      loadCategories();
    }
  }

  async function changeSubcategoryState(id, newState) {
    let msg = newState === 0 ? "¿Archivar esta subcategoría?"
      : newState === 1 ? "¿Restaurar esta subcategoría?"
      : "¿Marcar subcategoría como inactiva?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE subcategories SET is_active = ? WHERE id = ?", [newState, id]);
      loadSubcategories(selectedCategoryId);
    }
  }
</script>

<!-- Modal Categoría -->
{#if showCatModal}
  <div class="modal-backdrop" on:click={closeModal} role="button" tabindex="-1" on:keydown={e => e.key === 'Escape' && closeModal()}>
    <div class="modal-box" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>{isEditing ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
        <button class="btn-close" on:click={closeModal}>✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Nombre</label>
          <input
            type="text"
            class="form-control"
            bind:value={currentCat.name}
            placeholder="Nombre de la categoría..."
            on:keydown={e => e.key === 'Enter' && saveCategory()}
            autofocus
          />
        </div>
        <div class="form-group">
          <label>Color identificador</label>
          <div class="color-row">
            <input type="color" class="color-input" bind:value={currentCat.color} />
            <div class="color-preview" style="border-left: 4px solid {currentCat.color}; background: {currentCat.color}18;">
              <span style="color: {currentCat.color}; font-weight: 600;">{currentCat.name || 'Vista previa'}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={closeModal}>Cancelar</button>
        <button class="btn btn-primary" on:click={saveCategory}>
          {isEditing ? 'Guardar cambios' : 'Agregar'}
        </button>
      </div>
    </div>
  </div>
{/if}

<div style="display: flex; gap: 20px;">

  <!-- Categorías -->
  <div class="card" style="flex: 1;">
    <div class="card-title" style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <BackLink href="/settings" label="Volver a Ajustes" />
        <span>Categorías Principales</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <select bind:value={viewState} on:change={() => { loadCategories(); loadSubcategories(selectedCategoryId); }} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.85em;">
          <option value="1">🟢 Activas</option>
          <option value="2">🟠 Inactivas</option>
          <option value="0">📁 Archivadas</option>
        </select>
        <button class="btn btn-primary" on:click={openAddModal} style="white-space: nowrap;">+ Nueva</button>
      </div>
    </div>

    <div class="list-group">
      {#each categories as cat}
        <div
          class="list-item {selectedCategoryId === cat.id ? 'active' : ''}"
          style="border-left: 4px solid {cat.color || '#6366f1'};"
          role="button"
          tabindex="0"
          on:click={() => loadSubcategories(cat.id)}
          on:keydown={e => e.key === 'Enter' && loadSubcategories(cat.id)}
        >
          <span class="cat-name">{cat.name}</span>
          <div class="item-actions">
            <button class="btn-icon" title="Editar" on:click|stopPropagation={() => openEditModal(cat)}>✏️</button>
            {#if viewState === '1'}
              <button class="btn-icon" title="Inactivar" on:click|stopPropagation={() => changeCategoryState(cat.id, 2)}>⏸️</button>
              <button class="btn-icon" title="Archivar" on:click|stopPropagation={() => changeCategoryState(cat.id, 0)}>📁</button>
            {:else if viewState === '2'}
              <button class="btn-icon" title="Activar" on:click|stopPropagation={() => changeCategoryState(cat.id, 1)}>▶️</button>
              <button class="btn-icon" title="Archivar" on:click|stopPropagation={() => changeCategoryState(cat.id, 0)}>📁</button>
            {:else}
              <button class="btn-icon" title="Restaurar" on:click|stopPropagation={() => changeCategoryState(cat.id, 1)}>🔄</button>
            {/if}
          </div>
        </div>
      {/each}
      {#if categories.length === 0}
        <p style="color: var(--text-muted); text-align: center; font-size: 0.9rem;">Sin categorías.</p>
      {/if}
    </div>
  </div>

  <!-- Subcategorías -->
  <div class="card" style="flex: 1;">
    <div class="card-title">
      Subcategorías {selectedCategoryId ? `(${categories.find(c => c.id === selectedCategoryId)?.name})` : ''}
    </div>

    {#if selectedCategoryId}
      <div style="display: flex; gap: 10px; margin-bottom: 20px;">
        <input type="text" class="form-control" bind:value={newSubcatName} placeholder="Nueva subcategoría..." on:keypress={e => e.key === 'Enter' && addSubcategory()}>
        <button class="btn btn-primary" on:click={addSubcategory}>Add</button>
      </div>

      <div class="list-group">
        {#each subcategories as sub}
          <div class="list-item">
            <span>{sub.name}</span>
            <div class="item-actions">
              {#if viewState === '1'}
                <button class="btn-icon" title="Inactivar" on:click={() => changeSubcategoryState(sub.id, 2)}>⏸️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeSubcategoryState(sub.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon" title="Activar" on:click={() => changeSubcategoryState(sub.id, 1)}>▶️</button>
                <button class="btn-icon" title="Archivar" on:click={() => changeSubcategoryState(sub.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar" on:click={() => changeSubcategoryState(sub.id, 1)}>🔄</button>
              {/if}
            </div>
          </div>
        {/each}
        {#if subcategories.length === 0}
          <p style="color: var(--text-muted); text-align: center; font-size: 0.9rem;">Sin subcategorías.</p>
        {/if}
      </div>
    {:else}
      <div style="padding: 40px 0; text-align: center; color: var(--text-muted);">
        <span style="font-size: 2rem;">👈</span>
        <p>Seleccione una categoría para ver sus subcategorías.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-box {
    background: white;
    border-radius: 10px;
    width: 420px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    overflow: hidden;
  }
  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color);
  }
  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }
  .btn-close {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .btn-close:hover { background: #f0f0f0; }
  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--border-color);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .form-group label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-muted);
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
  }

  /* List */
  .form-control {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    outline: none;
    font-size: 0.9rem;
  }
  .form-control:focus {
    border-color: var(--primary);
  }
  .list-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .list-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background 0.15s;
    gap: 8px;
  }
  .list-item:hover { background-color: #f8f9fa; }
  .list-item.active {
    background-color: var(--primary);
    color: white;
    border-color: var(--primary);
  }
  .cat-name {
    flex: 1;
    font-size: 0.93rem;
  }
  .item-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
  }
  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s, transform 0.15s;
    padding: 3px 5px;
    font-size: 0.95rem;
    line-height: 1;
    border-radius: 4px;
  }
  .btn-icon:hover {
    opacity: 1;
    transform: scale(1.15);
  }
  .list-item.active .btn-icon { opacity: 0.85; }
  .btn-secondary {
    padding: 7px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid #aab0bb;
    background: #f1f3f5;
    color: #333;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
  }
  .btn-secondary:hover { background: #e2e6ea; border-color: #888; }
</style>
