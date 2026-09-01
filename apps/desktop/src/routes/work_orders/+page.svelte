<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { shouldReserveStock, statusBadgeClass, statusLabel } from '@esr/core';
  import { generateWorkOrderPDF } from '@esr/reports';
  import { Icon, PdfPreviewModal } from '@esr/ui';
  import FilterBar from '$lib/components/list/FilterBar.svelte';

  /**
   * Los estados de ESR Pro, que NO son los de Cloud.
   *
   * Aquí el ciclo es pendiente → preparado → cargado → entregado → en recogida →
   * retornado → cerrado; en Cloud es otro. Unificarlos es migrar datos en las
   * dos bases y reescribir las reservas de stock: queda anotado como deuda.
   */
  const ESTADOS = [
    { value: '', label: 'Cualquier estado' },
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'preparado', label: 'Preparado' },
    { value: 'cargado', label: 'Cargado' },
    { value: 'entregado', label: 'Entregado' },
    { value: 'en recogida', label: 'En recogida' },
    { value: 'retornado', label: 'Retornado' },
    { value: 'cerrado', label: 'Cerrado' }
  ];

  /** El siguiente paso del ciclo, y cómo se llama el botón que lo da. */
  const SIGUIENTE = {
    pendiente: { estado: 'preparado', texto: 'Preparar' },
    preparado: { estado: 'cargado', texto: 'Cargar' },
    cargado: { estado: 'entregado', texto: 'Entregar' },
    entregado: { estado: 'en recogida', texto: 'Recoger' },
    'en recogida': { estado: 'retornado', texto: 'Retornar' }
  };

  let workOrders = [];
  let estado = '';
  let busqueda = '';
  let recargando = false;

  let showPdfPreview = false;
  let pdfPreviewUrl = '';
  let pdfPreviewFilename = '';
  let pdfPreviewTitle = '';

  /**
   * Las órdenes VIVAS.
   *
   * `is_active = 1` fijo, y no un filtro: una orden tiene UN ciclo de vida y ese
   * es el que el cliente entiende. El eje de circulación que había encima
   * —activa, inactiva, archivada— era un segundo estado paralelo, y sus botones
   * permitían archivar una orden y perderla de vista sin forma de recuperarla.
   */
  async function loadWorkOrders() {
    if (!window.api?.db) return;
    workOrders = await window.api.db.get(`
      SELECT w.*, c.name as client_name
      FROM work_orders w
      LEFT JOIN clients c ON w.client_id = c.id
      WHERE w.is_active = 1
      ORDER BY w.id DESC
    `);
  }

  onMount(() => loadWorkOrders());

  async function recargar() {
    recargando = true;
    try {
      await loadWorkOrders();
    } finally {
      recargando = false;
    }
  }

  /** Filtrado EN MEMORIA: la consulta ya trajo todas las filas de SQLite. */
  $: termino = busqueda.trim().toLowerCase();
  $: visibles = workOrders.filter((wo) => {
    if (estado && wo.status !== estado) return false;
    if (!termino) return true;
    return [wo.client_name, wo.responsible_person, `WO-${String(wo.id).padStart(5, '0')}`].some(
      (v) => (v ?? '').toLowerCase().includes(termino)
    );
  });

  const numero = (wo) => `WO-${String(wo.id).padStart(5, '0')}`;

  async function avanzar(wo) {
    const paso = SIGUIENTE[wo.status];
    if (!paso) return;
    try {
      if (shouldReserveStock(paso.estado)) {
        await window.api.inventory.reserveWorkOrderStock(wo.id, paso.estado);
      } else {
        await window.api.db.run('UPDATE work_orders SET status = ? WHERE id = ?', [paso.estado, wo.id]);
      }
      loadWorkOrders();
    } catch (err) {
      alert(err?.message || 'No se pudo reservar el stock de la orden.');
      console.error(err);
    }
  }

  async function imprimir(wo) {
    const items = await window.api.db.get(`
      SELECT wi.quantity, i.name, i.internal_code
      FROM work_order_items wi JOIN items i ON wi.item_id = i.id
      WHERE wi.work_order_id = ?`, [wo.id]);
    const company = (await window.api.db.get('SELECT * FROM company_info WHERE id = 1'))?.[0] ?? null;
    const { url, filename } = generateWorkOrderPDF(wo, items, 'preview', company);
    pdfPreviewUrl = url;
    pdfPreviewFilename = filename;
    pdfPreviewTitle = `Orden ${numero(wo)}`;
    showPdfPreview = true;
  }

  /**
   * Al conduce REAL, no a un PDF inventado.
   *
   * Aquí había un botón «Generar Conduce» que llamaba a `generateConducePDF`
   * pasándole LA ORDEN, y titulaba «Conduce WO-00000». No creaba nada, no
   * quedaba registrado y numeraba con el número de la orden: era un segundo
   * «conduce» que competía con la entidad de verdad y por eso el término salía
   * donde nadie lo esperaba. Ahora hace lo mismo que el botón del editor.
   */
  async function irAlConduce(wo) {
    const existente = await window.api.db.getOne(
      'SELECT id FROM conduces WHERE work_order_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1',
      [wo.id]
    );
    goto(existente ? `/conduces/edit?id=${existente.id}` : `/conduces/edit?wo=${wo.id}`);
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
</div>

<div class="card">
  <FilterBar
    search={{ placeholder: 'Número, cliente o responsable', value: busqueda }}
    selects={[
      { name: 'status', label: 'Estado de la orden', value: estado, options: ESTADOS, width: '11rem' }
    ]}
    onSearch={(v) => (busqueda = v)}
    onSelect={(_, v) => (estado = v)}
  >
    <button slot="actions" type="button" class="btn btn-primary btn-new" on:click={() => goto('/work_orders/edit')}>
      Nueva orden
    </button>
  </FilterBar>

  <div class="table-wrapper">
    <table class="table table--acento">
      <thead>
        <tr>
          <th>Número</th>
          <th>Cliente</th>
          <th>Fecha</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each visibles as wo (wo.id)}
          <tr>
            <td style="font-weight:600;">{numero(wo)}</td>
            <td>{wo.client_name || '—'}</td>
            <td>{wo.date || '—'}</td>
            <td>{wo.responsible_person || '—'}</td>
            <td>
              <!-- Badge del sistema. Antes iba en ALL CAPS con CSS local, que
                   por ir sin capa anulaba la píldora compartida. -->
              <span class="badge {statusBadgeClass(wo.status)}">{statusLabel(wo.status)}</span>
            </td>
            <td class="acciones">
              {#if SIGUIENTE[wo.status]}
                <!-- La acción de negocio va con ETIQUETA, no con un icono mudo:
                     «Preparar» y «Cargar» no tienen glifo que se entienda solo. -->
                <button type="button" class="btn btn-secondary btn-sm" on:click={() => avanzar(wo)}>
                  {SIGUIENTE[wo.status].texto}
                </button>
              {/if}
              <button
                type="button"
                class="btn-icono"
                on:click={() => imprimir(wo)}
                aria-label="Imprimir la orden {numero(wo)}"
                title="Imprimir la orden"
              >
                <Icon name="printer" size={16} />
              </button>
              <button
                type="button"
                class="btn-icono"
                on:click={() => irAlConduce(wo)}
                aria-label="Conduce de la orden {numero(wo)}"
                title="Ver o crear el conduce"
              >
                <Icon name="stock" size={16} />
              </button>
              <a
                class="btn-icono"
                href={`/checklist?wo=${wo.id}`}
                aria-label="Checklist de la orden {numero(wo)}"
                title="Checklist"
              >
                <Icon name="listChecks" size={16} />
              </a>
              <a class="btn-view" href={`/work_orders/edit?id=${wo.id}`}>Ver</a>
            </td>
          </tr>
        {:else}
          <tr>
            <!-- `.empty-state` va en un <p> DENTRO de la celda, nunca sobre el
                 <td>: en la misma capa, `.table td` le ganaría. -->
            <td colspan="6">
              <p class="empty-state">
                {termino || estado
                  ? 'Ninguna orden coincide con el filtro.'
                  : 'No hay órdenes registradas.'}
              </p>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<PdfPreviewModal bind:show={showPdfPreview} pdfUrl={pdfPreviewUrl}
  filename={pdfPreviewFilename} title={pdfPreviewTitle} />

<style>
  /* Solo el botón de icono de la fila. Los badges ya NO se definen aquí: su
     versión local iba sin capa, ganaba a theme.css y forzaba el ALL CAPS. */
  .acciones {
    text-align: right;
    white-space: nowrap;
  }

  .btn-icono {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    vertical-align: middle;
    margin-right: var(--sp-1);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .btn-icono:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
