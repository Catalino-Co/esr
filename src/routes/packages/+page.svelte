<script>
  import { onMount } from 'svelte';
  import Modal from '$lib/components/Modal.svelte';

  let viewState = "1";
  let packages = [];
  let availableItems = [];
  
  let showModal = false;
  let isEditing = false;
  
  let currentPackage = {
    id: null,
    name: '',
    description: '',
    suggested_price: 0,
    notes: ''
  };
  
  // Lista de items dentro del paquete editado
  let packageItems = [];
  
  // Variables para agregar un item al paquete
  let selectedItemId = '';
  let selectedItemQty = 1;

  async function loadData() {
    if (window.api && window.api.db) {
      availableItems = await window.api.db.get("SELECT id, name, internal_code, rental_price FROM items WHERE is_active = 1 ORDER BY name ASC");
      loadPackages();
    }
  }

  async function loadPackages() {
    let query = `
      SELECT p.*, COUNT(pi.item_id) as total_items
      FROM packages p
      LEFT JOIN package_items pi ON p.id = pi.package_id
      WHERE p.is_active = ?
      GROUP BY p.id
      ORDER BY p.name ASC
    `;
    packages = await window.api.db.get(query, [parseInt(viewState)]);
  }

  async function loadPackageItems(packageId) {
    let query = `
      SELECT pi.*, i.name as item_name, i.internal_code 
      FROM package_items pi
      JOIN items i ON pi.item_id = i.id
      WHERE pi.package_id = ?
    `;
    packageItems = await window.api.db.get(query, [packageId]);
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentPackage = { id: null, name: '', description: '', suggested_price: 0, notes: '' };
    packageItems = [];
    selectedItemId = '';
    selectedItemQty = 1;
    showModal = true;
  }

  async function openEdit(pkg) {
    isEditing = true;
    currentPackage = { ...pkg };
    await loadPackageItems(pkg.id);
    selectedItemId = '';
    selectedItemQty = 1;
    showModal = true;
  }

  async function savePackage() {
    if (!currentPackage.name) {
      alert("El nombre del paquete es obligatorio");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE packages SET name=?, description=?, suggested_price=?, notes=? WHERE id=?`, 
        [currentPackage.name, currentPackage.description, currentPackage.suggested_price, currentPackage.notes, currentPackage.id]
      );
      
      // Recrear los items del paquete: borramos todos y los volvemos a insertar
      await window.api.db.run(`DELETE FROM package_items WHERE package_id=?`, [currentPackage.id]);
      for (const pi of packageItems) {
        await window.api.db.run(`INSERT INTO package_items (package_id, item_id, quantity) VALUES (?, ?, ?)`, 
          [currentPackage.id, pi.item_id, pi.quantity]);
      }
    } else {
      const res = await window.api.db.run(`
        INSERT INTO packages (name, description, suggested_price, notes) VALUES (?, ?, ?, ?)`,
        [currentPackage.name, currentPackage.description, currentPackage.suggested_price, currentPackage.notes]
      );
      
      const newId = res.id;
      for (const pi of packageItems) {
        await window.api.db.run(`INSERT INTO package_items (package_id, item_id, quantity) VALUES (?, ?, ?)`, 
          [newId, pi.item_id, pi.quantity]);
      }
    }
    
    showModal = false;
    loadPackages();
  }

  function addItemToPackage() {
    if (!selectedItemId || selectedItemQty < 1) return;
    
    // Verificar si ya existe
    const existing = packageItems.find(p => p.item_id == selectedItemId);
    if (existing) {
      existing.quantity += parseInt(selectedItemQty);
      packageItems = [...packageItems]; // trigger reactividad
    } else {
      const itemDef = availableItems.find(i => i.id == selectedItemId);
      if (itemDef) {
        packageItems = [...packageItems, {
          item_id: itemDef.id,
          quantity: parseInt(selectedItemQty),
          item_name: itemDef.name,
          internal_code: itemDef.internal_code
        }];
      }
    }
    
    selectedItemId = '';
    selectedItemQty = 1;
  }

  function removeItemFromPackage(itemId) {
    packageItems = packageItems.filter(p => p.item_id !== itemId);
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este paquete?" 
            : newState === 1 ? "¿Marcar este paquete como Activo?"
            : "¿Marcar este paquete como Inactivo?";
    if (confirm(msg)) {
      await window.api.db.run("UPDATE packages SET is_active = ? WHERE id = ?", [newState, id]);
      loadPackages();
    }
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center;">
    <div style="display: flex; gap: 15px; align-items: center;">
      <span>Paquetes / Planes Predeterminados</span>
      <select bind:value={viewState} on:change={loadPackages} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={openCreate}>+ Nuevo Paquete</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nombre del Paquete</th>
          <th>Descripción</th>
          <th>Cant. Ítems</th>
          <th>Precio Sugerido</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each packages as pkg}
          <tr>
            <td style="font-weight: 500;">{pkg.name}</td>
            <td style="color: var(--text-muted);">{pkg.description || '-'}</td>
            <td><span class="badge badge-primary">{pkg.total_items} ítems</span></td>
            <td style="font-weight: bold; color: var(--success);">${pkg.suggested_price.toFixed(2)}</td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(pkg)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(pkg.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(pkg.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(pkg.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(pkg.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(pkg.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay paquetes creados.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Paquete' : 'Nuevo Paquete'}>
  <div style="display: flex; flex-direction: column; gap: 15px;">
    <div>
      <label for="pkg-name">Nombre del Paquete *</label>
      <input id="pkg-name" type="text" bind:value={currentPackage.name} class="form-control" placeholder="Ej. Paquete Boda Esencial">
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="pkg-desc">Descripción Breve</label>
        <input id="pkg-desc" type="text" bind:value={currentPackage.description} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="pkg-price">Precio Sugerido</label>
        <input id="pkg-price" type="number" step="0.01" bind:value={currentPackage.suggested_price} class="form-control">
      </div>
    </div>
    
    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 10px 0;">
    
    <label style="color: var(--text-main); font-weight: 600;">Contenido del Paquete</label>
    
    <div style="display: flex; gap: 10px; align-items: flex-end; background: #f8f9fa; padding: 15px; border-radius: 8px;">
      <div style="flex: 2;">
        <label for="pkg-item-sel">Buscar Ítem</label>
        <select id="pkg-item-sel" class="form-control" bind:value={selectedItemId}>
          <option value="">Seleccione un ítem...</option>
          {#each availableItems as item}
            <option value={item.id}>[{item.internal_code}] {item.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="pkg-item-qty">Cantidad</label>
        <input id="pkg-item-qty" type="number" min="1" bind:value={selectedItemQty} class="form-control">
      </div>
      <button class="btn btn-secondary" on:click={addItemToPackage} disabled={!selectedItemId}>Agregar</button>
    </div>

    <!-- Lista de Items en el Paquete -->
    <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px;">
      <table class="table" style="margin: 0;">
        <thead style="background: var(--bg-color); position: sticky; top: 0;">
          <tr>
            <th>Ítem</th>
            <th>Cant.</th>
            <th style="width: 50px;"></th>
          </tr>
        </thead>
        <tbody>
          {#each packageItems as pItem}
            <tr>
              <td>
                <span style="font-size: 0.8rem; color: var(--text-muted);">{pItem.internal_code}</span><br>
                {pItem.item_name}
              </td>
              <td><b>{pItem.quantity}</b></td>
              <td>
                <button class="btn-icon text-danger" on:click={() => removeItemFromPackage(pItem.item_id)}>🗑️</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 15px;">Aún no has agregado ítems al paquete.</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div>
      <label for="pkg-notes">Observaciones Internas</label>
      <textarea id="pkg-notes" bind:value={currentPackage.notes} class="form-control" rows="2"></textarea>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={savePackage}>Guardar Paquete</button>
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
