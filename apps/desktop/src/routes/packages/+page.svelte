<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt } from '@esr/reports';
  import { RECORD_STATES, RECORD_STATE_FILTER_LABELS, recordStateBadgeClass, recordStateLabel } from '@esr/core';
  import { Icon, Modal } from '@esr/ui';
  import StatusSelect from '$lib/components/list/StatusSelect.svelte';
  import { confirmDialog } from '$lib/stores/confirmDialog.js';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { toasts } from '$lib/stores/toasts.js';

  const opcionesEstado = RECORD_STATES.map((value) => ({
    value,
    label: RECORD_STATE_FILTER_LABELS[value]
  }));

  let viewState = '1';
  let packages = [];
  let recargando = false;

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

  async function recargar() {
    recargando = true;
    try {
      await loadPackages();
    } finally {
      recargando = false;
    }
  }

  /* ── Selección múltiple, en memoria ──────────────────────────────────────
   * Mismo idioma de «copiar el Set» que ya usa `invoices/new/+page.svelte`.
   */
  let modo = false;
  let seleccion = new Set();

  function alternarModo() {
    modo = !modo;
    if (!modo) seleccion = new Set();
  }

  function alternar(id) {
    const copia = new Set(seleccion);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    seleccion = copia;
  }

  function alternarTodas() {
    seleccion = todas ? new Set() : new Set(packages.map((p) => p.id));
  }

  $: total = packages.length;
  $: todas = total > 0 && seleccion.size === total;
  $: algunas = seleccion.size > 0 && !todas;
  $: seleccionados = packages.filter((p) => seleccion.has(p.id));
  $: activables = seleccionados.filter((p) => p.is_active !== 1).length;
  $: inactivables = seleccionados.filter((p) => p.is_active !== 2).length;
  $: archivables = seleccionados.filter((p) => p.is_active !== 0).length;

  /** Una sola confirmación para todo el lote, no una por fila. */
  async function aplicarEstadoLote(estado, verbo) {
    const n = seleccionados.filter((p) => p.is_active !== estado).length;
    if (n === 0) return;
    if (!(await confirmDialog.ask(`¿${verbo} ${n} paquete(s)?`))) return;
    for (const pkg of seleccionados) {
      if (pkg.is_active === estado) continue;
      await window.api.db.run('UPDATE packages SET is_active = ? WHERE id = ?', [estado, pkg.id]);
    }
    toasts.success(`${n} paquete(s) ${verbo.toLowerCase()}(s).`);
    seleccion = new Set();
    await loadPackages();
  }

  /* ── Buscar por código ────────────────────────────────────────────────────
   * A diferencia de Eventos (que ya carga TODO en memoria), esta pantalla
   * carga un solo estado a la vez: buscar tiene que encontrar uno archivado
   * estando en «Activos», así que va contra la base entera, sin `is_active`
   * —mismo patrón que «buscar por número» en Cotizaciones—.
   */
  let buscandoCodigo = false;
  let consultaCodigo = '';
  let resultadosCodigo = [];
  let elegidoCodigo = -1;
  let temporizadorCodigo = null;

  function abrirBuscadorCodigo() {
    consultaCodigo = '';
    resultadosCodigo = [];
    elegidoCodigo = -1;
    buscandoCodigo = true;
  }

  function alTeclearCodigo() {
    elegidoCodigo = -1;
    clearTimeout(temporizadorCodigo);
    temporizadorCodigo = setTimeout(buscarPorCodigo, 250);
  }

  async function buscarPorCodigo() {
    const termino = consultaCodigo.trim();
    if (termino.length < 1 || !window.api?.db) {
      resultadosCodigo = [];
      return;
    }
    resultadosCodigo = await window.api.db.get(
      `SELECT * FROM packages WHERE code LIKE '%' || ? || '%' ORDER BY (code = ?) DESC, id DESC LIMIT 10`,
      [termino, termino]
    );
    elegidoCodigo = resultadosCodigo.length > 0 ? 0 : -1;
  }

  function alPulsarCodigo(evento) {
    if (resultadosCodigo.length === 0) return;
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      elegidoCodigo = (elegidoCodigo + 1) % resultadosCodigo.length;
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      elegidoCodigo = (elegidoCodigo - 1 + resultadosCodigo.length) % resultadosCodigo.length;
    } else if (evento.key === 'Enter') {
      evento.preventDefault();
      abrirElegidoCodigo();
    }
  }

  function abrirElegidoCodigo() {
    const pkg = resultadosCodigo[elegidoCodigo];
    if (!pkg) return;
    buscandoCodigo = false;
    goto(`/packages/edit?id=${pkg.id}`);
  }

  /* ── Nuevo paquete, solo cabecera ──────────────────────────────────────────
   * Igual que Cloud: el diálogo crea SOLO nombre/descripción/precio/notas, y
   * redirige a `/packages/edit?id=...`, que ya tiene el selector de
   * artículos y no se toca.
   */
  let creando = false;
  let guardando = false;
  const VACIO = { name: '', description: '', suggested_price: 0, notes: '' };
  let nuevo = { ...VACIO };

  function abrirAlta() {
    nuevo = { ...VACIO };
    creando = true;
  }

  async function crearPaquete() {
    if (!nuevo.name.trim()) {
      dangerModal.show('El nombre del paquete es obligatorio.');
      return;
    }
    guardando = true;
    try {
      const fila = await window.api.db.getOne(
        'SELECT COALESCE(MAX(CAST(code AS INTEGER)), 1000) + 1 AS n FROM packages'
      );
      const code = String(fila?.n ?? 1001);
      const res = await window.api.db.run(
        'INSERT INTO packages (code, name, description, suggested_price, notes) VALUES (?, ?, ?, ?, ?)',
        [code, nuevo.name.trim(), nuevo.description, nuevo.suggested_price, nuevo.notes]
      );
      creando = false;
      goto(`/packages/edit?id=${res.id}`);
    } catch (err) {
      dangerModal.show('Error al crear el paquete. Revisa la consola.');
      console.error(err);
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
    <button
      type="button"
      class="grupo-btn"
      on:click={abrirBuscadorCodigo}
      aria-label="Buscar un paquete por su código"
      title="Buscar un paquete por su código"
    >
      <Icon name="search" size={18} />
    </button>
    <button
      type="button"
      class="grupo-btn"
      class:encendido={modo}
      aria-pressed={modo}
      aria-label={modo ? 'Salir del modo selección' : 'Seleccionar varios paquetes'}
      title={modo ? 'Salir del modo selección' : 'Seleccionar varios paquetes'}
      on:click={alternarModo}
    >
      <Icon name="listChecks" size={18} />
    </button>
  </div>

  <div class="herramientas-datos">
    <StatusSelect
      value={viewState}
      options={opcionesEstado}
      label="Estado"
      onchange={(e) => { viewState = e.currentTarget.value; loadPackages(); }}
    />
    <button type="button" class="btn btn-primary btn-new" on:click={abrirAlta}>Nuevo Paquete</button>
  </div>
</div>

<div class="card">
  {#if modo}
    <div class="barra-seleccion">
      <span class="cuenta">{seleccion.size} seleccionado(s)</span>
      <div class="acciones">
        <button
          type="button"
          class="btn btn-success"
          disabled={activables === 0}
          on:click={() => aplicarEstadoLote(1, 'Activar')}
        >
          Activar ({activables})
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          disabled={inactivables === 0}
          on:click={() => aplicarEstadoLote(2, 'Inactivar')}
        >
          Inactivar ({inactivables})
        </button>
        <button
          type="button"
          class="btn btn-danger"
          disabled={archivables === 0}
          on:click={() => aplicarEstadoLote(0, 'Archivar')}
        >
          Archivar ({archivables})
        </button>
      </div>
    </div>
  {/if}

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          {#if modo}
            <th class="check">
              <input
                type="checkbox"
                checked={todas}
                indeterminate={algunas}
                on:change={alternarTodas}
                aria-label="Seleccionar todos los de la pantalla"
              />
            </th>
          {/if}
          <th>Código</th>
          <th>Nombre del Paquete</th>
          <th>Descripción</th>
          <th>Cant. Ítems</th>
          <th>Precio Sugerido</th>
          <th>Estado</th>
          <th style="text-align: right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each packages as pkg}
          <tr>
            {#if modo}
              <td class="check">
                <input
                  type="checkbox"
                  checked={seleccion.has(pkg.id)}
                  on:change={() => alternar(pkg.id)}
                  aria-label="Seleccionar {pkg.name}"
                />
              </td>
            {/if}
            <td>{pkg.code}</td>
            <td style="font-weight: 500;">{pkg.name}</td>
            <td style="color: var(--text-muted);">{pkg.description || '—'}</td>
            <td><span class="badge badge-primary">{pkg.total_items} ítems</span></td>
            <td style="font-weight: bold; color: var(--success);">${fmt(pkg.suggested_price)}</td>
            <td>
              <span class="badge {recordStateBadgeClass(pkg.is_active)}">{recordStateLabel(pkg.is_active)}</span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn-icon" title="Editar" on:click={() => goto(`/packages/edit?id=${pkg.id}`)}>✏️</button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
              No hay paquetes creados.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<Modal bind:show={creando} title="Nuevo paquete" maxWidth="480px">
  <div class="form-grid">
    <div class="form-field full">
      <label for="pkg-name">Nombre *</label>
      <input id="pkg-name" type="text" bind:value={nuevo.name} placeholder="Paquete básico de sonido" />
    </div>
    <div class="form-field">
      <label for="pkg-price">Precio sugerido</label>
      <input id="pkg-price" type="number" min="0" step="0.01" bind:value={nuevo.suggested_price} />
    </div>
    <div class="form-field full">
      <label for="pkg-desc">Descripción</label>
      <input id="pkg-desc" type="text" bind:value={nuevo.description} />
    </div>
    <div class="form-field full">
      <label for="pkg-notes">Notas</label>
      <textarea id="pkg-notes" rows="2" bind:value={nuevo.notes}></textarea>
    </div>
    <p class="form-hint full">El código se asigna automáticamente al guardar.</p>
  </div>

  <div slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (creando = false)}>Cancelar</button>
    <button type="button" class="btn btn-primary" on:click={crearPaquete} disabled={guardando}>
      {guardando ? 'Creando…' : 'Crear paquete'}
    </button>
  </div>
</Modal>

<!-- Buscar por código. Consulta fresca contra toda la base, sin `is_active`. -->
<Modal bind:show={buscandoCodigo} title="Buscar paquete por código" maxWidth="560px">
  <!-- svelte-ignore a11y_autofocus -->
  <input
    class="buscador"
    type="search"
    role="combobox"
    autofocus
    bind:value={consultaCodigo}
    on:input={alTeclearCodigo}
    on:keydown={alPulsarCodigo}
    placeholder="1001"
    aria-label="Código del paquete"
    aria-expanded={resultadosCodigo.length > 0}
    aria-controls="resultados-paquete-codigo"
    aria-autocomplete="list"
    aria-activedescendant={elegidoCodigo >= 0 ? `resultado-paquete-codigo-${elegidoCodigo}` : undefined}
    autocomplete="off"
  />

  {#if consultaCodigo.trim() === ''}
    <p class="form-hint">
      Escriba el código. Se busca en todos los paquetes, también fuera del estado del listado.
    </p>
  {:else if resultadosCodigo.length === 0}
    <p class="empty-state">Ningún paquete con ese código.</p>
  {:else}
    <ul class="resultados" id="resultados-paquete-codigo" role="listbox" aria-label="Paquetes encontrados">
      {#each resultadosCodigo as pkg, indice (pkg.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <li
          id="resultado-paquete-codigo-{indice}"
          class="resultado"
          class:elegido={indice === elegidoCodigo}
          role="option"
          aria-selected={indice === elegidoCodigo}
          on:click={() => (elegidoCodigo = indice)}
          on:dblclick={abrirElegidoCodigo}
        >
          <span class="codigo">{pkg.code}</span>
          <span class="nombre">{pkg.name}</span>
          <span class="badge {recordStateBadgeClass(pkg.is_active)}">{recordStateLabel(pkg.is_active)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <svelte:fragment slot="footer">
    <button type="button" class="btn btn-secondary" on:click={() => (buscandoCodigo = false)}>Cancelar</button>
    <button type="button" class="btn btn-primary" on:click={abrirElegidoCodigo} disabled={elegidoCodigo < 0}>
      Abrir paquete
    </button>
  </svelte:fragment>
</Modal>

<style>
  .btn-icon { background: none; border: none; cursor: pointer; padding: 4px 5px; opacity: 0.6; transition: 0.2s; }
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .badge-primary { background-color: rgba(67,94,190,0.1); color: var(--primary); }

  .check {
    width: 2.5rem;
  }

  .barra-seleccion {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    margin-bottom: var(--sp-3);
    background: var(--surface-sunken);
    border-radius: var(--border-radius-sm);
  }

  .cuenta {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* Campos sueltos del diálogo de código: el estilo de campo cuelga de
     `.form-grid`, y aquí no hay rejilla. */
  .buscador {
    width: 100%;
    font-family: inherit;
    font-size: var(--font-sm);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: var(--bg-input);
    color: var(--text-primary);
  }

  .resultados {
    list-style: none;
    margin: var(--sp-3) 0 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
  }

  .resultado {
    display: grid;
    grid-template-columns: 5rem minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    cursor: pointer;
  }

  .resultado:last-child {
    border-bottom: none;
  }

  .resultado:hover {
    background: var(--bg-hover);
  }

  .resultado.elegido {
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .codigo {
    font-weight: 600;
  }

  .nombre {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
