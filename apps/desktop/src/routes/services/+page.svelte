<script>
  import { onMount } from 'svelte';
  import { fmt } from '@esr/reports';
  import { RECORD_STATES, RECORD_STATE_FILTER_LABELS, recordStateBadgeClass, recordStateLabel } from '@esr/core';
  import { validateServiceInput } from '@esr/schemas';
  import { FormattedNumberField, Icon, Modal } from '@esr/ui';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';
  import { dangerModal } from '$lib/stores/dangerModal.js';

  /**
   * Servicios: algo vendible que no es un articulo de inventario (una
   * Maestria de Ceremonias, vestirse de Santa...). Gemela de /services en
   * ESR Cloud. Sin repositorio propio: como Paquetes, SQL directo -pero sin
   * su segunda pantalla, porque un Servicio no tiene items hijos que
   * administrar-.
   */

  const opcionesEstado = RECORD_STATES.map((value) => ({
    value,
    label: RECORD_STATE_FILTER_LABELS[value]
  }));

  let viewState = '1';
  let services = [];
  let recargando = false;

  async function loadServices() {
    if (!window.api?.db) return;
    services = await window.api.db.get(
      'SELECT * FROM services WHERE is_active = ? ORDER BY name ASC',
      [parseInt(viewState)]
    );
  }

  onMount(() => loadServices());

  async function recargar() {
    recargando = true;
    try {
      await loadServices();
    } finally {
      recargando = false;
    }
  }

  async function cambiarEstado(service, estado, verbo) {
    if (!(await confirmDialog.ask(`¿${verbo} «${service.name}»?`))) return;
    await window.api.db.run('UPDATE services SET is_active = ? WHERE id = ?', [estado, service.id]);
    await loadServices();
  }

  /* ── Alta / edicion, en el mismo dialogo ─────────────────────────────────
   * Un Servicio no tiene items hijos que administrar, asi que no hace falta
   * una segunda pantalla como la de Paquetes: todo cabe en un dialogo.
   */
  const VACIO = { name: '', price: 0, notes: '' };
  let editingId = null;
  let draft = { ...VACIO };
  let editando = false;
  let guardando = false;

  function abrirAlta() {
    editingId = null;
    draft = { ...VACIO };
    editando = true;
  }

  function abrirEdicion(service) {
    editingId = service.id;
    draft = { name: service.name, price: service.price, notes: service.notes ?? '' };
    editando = true;
  }

  async function guardar() {
    const validacion = validateServiceInput(draft);
    if (!validacion.valid) {
      dangerModal.show('El nombre del servicio es obligatorio y el precio no puede ser negativo.');
      return;
    }
    guardando = true;
    try {
      const nombre = draft.name.trim();
      const duplicado = await window.api.db.getOne(
        'SELECT id FROM services WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?',
        [nombre, editingId ?? 0]
      );
      if (duplicado) {
        dangerModal.show(`Ya existe el servicio «${nombre}».`);
        return;
      }

      if (editingId) {
        await window.api.db.run('UPDATE services SET name = ?, price = ?, notes = ? WHERE id = ?', [
          nombre,
          Number(draft.price) || 0,
          draft.notes || null,
          editingId
        ]);
      } else {
        await window.api.db.run('INSERT INTO services (name, price, notes) VALUES (?, ?, ?)', [
          nombre,
          Number(draft.price) || 0,
          draft.notes || null
        ]);
      }
      editando = false;
      await loadServices();
    } finally {
      guardando = false;
    }
  }
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/" aria-label="Volver al inicio" title="Volver al inicio">
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
      options={opcionesEstado}
      label="Estado"
      onchange={(e) => { viewState = e.currentTarget.value; loadServices(); }}
    />
    <button type="button" class="btn btn-primary btn-new" on:click={abrirAlta}>Nuevo servicio</button>
  </div>
</div>

<div class="card">
  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Precio</th>
          <th>Notas</th>
          <th>Estado</th>
          <th style="text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each services as service (service.id)}
          <tr>
            <td style="font-weight: 500;">{service.name}</td>
            <td style="font-weight: bold; color: var(--success);">${fmt(service.price)}</td>
            <td style="color: var(--text-muted);">{service.notes || '—'}</td>
            <td>
              <span class="badge {recordStateBadgeClass(service.is_active)}">
                {recordStateLabel(service.is_active)}
              </span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar" on:click={() => abrirEdicion(service)}>✏️</button>
              {#if service.is_active !== 1}
                <button class="btn-icon" title="Reactivar" on:click={() => cambiarEstado(service, 1, 'Reactivar')}>▶️</button>
              {/if}
              {#if service.is_active === 1}
                <button class="btn-icon" title="Desactivar" on:click={() => cambiarEstado(service, 2, 'Desactivar')}>⏸️</button>
              {/if}
              {#if service.is_active !== 0}
                <button class="btn-icon text-danger" title="Archivar" on:click={() => cambiarEstado(service, 0, 'Archivar')}>📁</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">
              No hay servicios en este estado.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={editando} title={editingId ? 'Editar servicio' : 'Nuevo servicio'} maxWidth="480px">
  <div class="form-grid">
    <div class="form-field full">
      <label for="svc-name">Nombre *</label>
      <input id="svc-name" type="text" bind:value={draft.name} placeholder="Maestría de Ceremonias" />
    </div>
    <div class="form-field">
      <label for="svc-price">Precio</label>
      <FormattedNumberField id="svc-price" min={0} bind:value={draft.price} />
    </div>
    <div class="form-field full">
      <label for="svc-notes">Notas</label>
      <textarea id="svc-notes" rows="2" bind:value={draft.notes}></textarea>
    </div>
  </div>

  <div slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (editando = false)}><Icon name="x" size={16} />Cancelar</button>
    <button type="button" class="btn btn-primary" on:click={guardar} disabled={guardando}>
      <Icon name="check" size={16} />{guardando ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear servicio'}
    </button>
  </div>
</Modal>

<style>
  .btn-icon { background: none; border: none; cursor: pointer; padding: 4px 5px; opacity: 0.6; transition: 0.2s; }
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
</style>
