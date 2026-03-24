<script>
  import { onMount } from 'svelte';
  
  let categories = [];
  let subcategories = [];
  
  let selectedCategoryId = null;
  
  let newCatName = '';
  let newSubcatName = '';

  async function loadCategories() {
    if (window.api && window.api.db) {
      categories = await window.api.db.get("SELECT * FROM categories ORDER BY name ASC");
    }
  }

  async function loadSubcategories(categoryId) {
    if (window.api && window.api.db && categoryId) {
      subcategories = await window.api.db.get("SELECT * FROM subcategories WHERE category_id = ? ORDER BY name ASC", [categoryId]);
      selectedCategoryId = categoryId;
    } else {
      subcategories = [];
      selectedCategoryId = null;
    }
  }

  onMount(() => {
    loadCategories();
  });

  async function addCategory() {
    if (!newCatName.trim()) return;
    await window.api.db.run("INSERT INTO categories (name) VALUES (?)", [newCatName.trim()]);
    newCatName = '';
    loadCategories();
  }

  async function addSubcategory() {
    if (!newSubcatName.trim() || !selectedCategoryId) return;
    await window.api.db.run("INSERT INTO subcategories (category_id, name) VALUES (?, ?)", [selectedCategoryId, newSubcatName.trim()]);
    newSubcatName = '';
    loadSubcategories(selectedCategoryId);
  }

  async function deleteCategory(id) {
    if (confirm("Al eliminar la categoría se perderán las subcategorías. ¿Continuar?")) {
      await window.api.db.run("DELETE FROM subcategories WHERE category_id = ?", [id]);
      await window.api.db.run("DELETE FROM categories WHERE id = ?", [id]);
      if (selectedCategoryId === id) {
        selectedCategoryId = null;
        subcategories = [];
      }
      loadCategories();
    }
  }

  async function deleteSubcategory(id) {
    if (confirm("¿Eliminar esta subcategoría?")) {
      await window.api.db.run("DELETE FROM subcategories WHERE id = ?", [id]);
      loadSubcategories(selectedCategoryId);
    }
  }
</script>

<div style="display: flex; gap: 20px;">
  <!-- Categories Col -->
  <div class="card" style="flex: 1;">
    <div class="card-title">Categorías Principales</div>
    
    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
      <input type="text" class="form-control" bind:value={newCatName} placeholder="Nueva categoría..." on:keypress={e => e.key === 'Enter' && addCategory()}>
      <button class="btn btn-primary" on:click={addCategory}>Add</button>
    </div>

    <div class="list-group">
      {#each categories as cat}
        <div class="list-item {selectedCategoryId === cat.id ? 'active' : ''}" on:click={() => loadSubcategories(cat.id)}>
          <span>{cat.name}</span>
          <button class="btn-icon" on:click|stopPropagation={() => deleteCategory(cat.id)}>🗑️</button>
        </div>
      {/each}
      {#if categories.length === 0}
        <p style="color: var(--text-muted); text-align: center; font-size: 0.9rem;">Sin categorías.</p>
      {/if}
    </div>
  </div>

  <!-- Subcategories Col -->
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
            <button class="btn-icon" on:click={() => deleteSubcategory(sub.id)}>🗑️</button>
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
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.2s;
  }
  .list-item:hover {
    background-color: #f8f9fa;
  }
  .list-item.active {
    background-color: var(--primary);
    color: white;
    border-color: var(--primary);
  }
  .list-item.active .btn-icon {
    opacity: 1;
  }
  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    transition: 0.2s;
  }
  .btn-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }
</style>
