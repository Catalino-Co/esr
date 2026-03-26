<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt } from '$lib/utils/format';

  let viewState = "1";
  let packages = [];

  async function loadPackages() {
    if (window.api && window.api.db) {
      packages = await window.api.db.get(`
        SELECT p.*, COUNT(pi.item_id) as total_items
        FROM packages p
        LEFT JOIN package_items pi ON p.id = pi.package_id
        WHERE p.is_active = ?
        GROUP BY p.id
        ORDER BY p.name ASC
      `, [parseInt(viewState)]);
    }
  }

  onMount(() => loadPackages());

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
      <select bind:value={viewState} on:change={loadPackages}
        style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
    </div>
    <button class="btn btn-primary" on:click={() => goto('/packages/edit')}>+ Nuevo Paquete</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Nombre del Paquete</th>
          <th>Descripción</th>
          <th>Cant. Ítems</th>
          <th>Precio Sugerido</th>
          <th style="text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each packages as pkg}
          <tr>
            <td style="font-weight: 500;">{pkg.name}</td>
            <td style="color: var(--text-muted);">{pkg.description || '—'}</td>
            <td><span class="badge badge-primary">{pkg.total_items} ítems</span></td>
            <td style="font-weight: bold; color: var(--success);">${fmt(pkg.suggested_price)}</td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar" on:click={() => goto(`/packages/edit?id=${pkg.id}`)}>✏️</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(pkg.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger"  title="Archivar"  on:click={() => changeState(pkg.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar"   on:click={() => changeState(pkg.id, 1)}>▶️</button>
                <button class="btn-icon text-danger"  title="Archivar"  on:click={() => changeState(pkg.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar" on:click={() => changeState(pkg.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">
              No hay paquetes creados.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .btn-icon { background: none; border: none; cursor: pointer; padding: 4px 5px; opacity: 0.6; transition: 0.2s; }
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger  { color: var(--danger); }
  .text-warning { color: var(--warning); }
  .text-success { color: var(--success); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
  .badge-primary { background-color: rgba(67,94,190,0.1); color: var(--primary); }
</style>
