<script>
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fmt } from '@esr/reports';
  import { unwrap, unwrapOr } from '$lib/ipc';

  /**
   * Emision de facturas, en dos fases: elegir orden y elegir entregas.
   *
   * Se emite desde AQUI y no desde el conduce porque una factura cubre N
   * entregas de la misma orden; emitir desde el conduce la haria siempre 1:1 y
   * la tabla de enlace sobraria. Las pantallas de conduce y de orden traen aqui
   * con `?wo=` y `?conduce=`: son atajos a este mismo camino, no flujos
   * paralelos.
   */
  let workOrderId = null;
  let preseleccion = null;

  let orders = [];
  let conduces = [];
  let seleccion = new Set();
  let lineas = [];
  let subtotal = 0;

  let fecha = new Date().toISOString().slice(0, 10);
  let vencimiento = '';
  let descuento = 0;
  let impuesto = 0;
  let notas = '';

  let cargando = true;
  let guardando = false;
  let errorMsg = '';

  /**
   * El dia que se instala el modulo, TODAS las entregas historicas aparecen
   * como pendientes —incluidas las ya cobradas fuera del sistema—. Por defecto
   * se muestran las de los ultimos meses; el resto, bajo peticion.
   */
  let soloRecientes = true;
  const DIAS_RECIENTES = 90;

  function desde() {
    const d = new Date();
    d.setDate(d.getDate() - DIAS_RECIENTES);
    return d.toISOString().slice(0, 10);
  }

  /**
   * La orden se lee de la URL de forma REACTIVA, no en `onMount`.
   *
   * Al pasar de `/invoices/new` a `/invoices/new?wo=7` SvelteKit reutiliza el
   * componente —es la misma ruta— y `onMount` no vuelve a ejecutarse: la
   * pantalla se quedaba en la fase 1 con la URL ya cambiada.
   *
   * `ultimaClave` evita recargar cuando cambia cualquier otra cosa de `$page`.
   */
  let ultimaClave = null;

  $: parametros = $page.url.searchParams;
  $: clave = `${parametros.get('wo') || ''}|${parametros.get('conduce') || ''}`;
  $: if (typeof window !== 'undefined' && clave !== ultimaClave) {
    ultimaClave = clave;
    workOrderId = parametros.get('wo') ? Number(parametros.get('wo')) : null;
    preseleccion = parametros.get('conduce') ? Number(parametros.get('conduce')) : null;
    cargar();
  }

  async function cargar() {
    cargando = true;
    errorMsg = '';
    try {
      if (!workOrderId) {
        orders = unwrapOr(
          await window.api.invoices.listOrdersWithBillable(
            soloRecientes ? { since: desde() } : {}
          ),
          []
        );
      } else {
        conduces = unwrap(await window.api.invoices.listBillable(workOrderId));
        // Si se llego desde un conduce concreto, solo ese viene marcado; si se
        // llego desde la orden, todo lo pendiente.
        seleccion = new Set(
          preseleccion
            ? conduces.filter((c) => c.id === preseleccion).map((c) => c.id)
            : conduces.map((c) => c.id)
        );
        // El conduce lleva su propio descuento y la factura recalcula el
        // subtotal desde las lineas, ignorandolo. Sin precargarlo, el usuario ve
        // un total en el conduce y otro mayor en la factura, y piensa que el
        // sistema se equivoco.
        descuento = redondear(
          conduces
            .filter((c) => seleccion.has(c.id))
            .reduce((suma, c) => suma + Number(c.discount || 0), 0)
        );
        await recalcular();
      }
    } catch (err) {
      errorMsg = err.message;
    } finally {
      cargando = false;
    }
  }

  function redondear(v) {
    return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  }

  async function recalcular() {
    const ids = [...seleccion];
    if (!ids.length) {
      lineas = [];
      subtotal = 0;
      return;
    }
    // La agregacion la hace el MISMO codigo que despues escribe las lineas. Si
    // se calculase aqui, algun dia la vista previa y lo guardado divergirian y
    // el usuario veria un total y firmaria otro.
    const prev = unwrapOr(await window.api.invoices.previewLines(ids), { lineas: [], subtotal: 0 });
    lineas = prev.lineas;
    subtotal = prev.subtotal;
  }

  async function alternar(id) {
    const copia = new Set(seleccion);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    seleccion = copia;
    await recalcular();
  }

  $: rebaja = Math.max(0, Number(descuento) || 0);
  $: impuestoNum = Math.max(0, Number(impuesto) || 0);
  $: total = redondear(Math.max(0, subtotal - rebaja + impuestoNum));
  $: excede = rebaja > subtotal;

  async function emitir() {
    if (guardando) return;
    errorMsg = '';
    guardando = true;
    try {
      const factura = unwrap(
        await window.api.invoices.create({
          work_order_id: workOrderId,
          conduce_ids: [...seleccion],
          date: fecha || null,
          due_date: vencimiento || null,
          discount: rebaja,
          tax_amount: impuestoNum,
          notes: notas || null
        })
      );
      goto(`/invoices/detail?id=${factura.id}`);
    } catch (err) {
      errorMsg = err.message;
      // Si otra emision se llevo una entrega, la lista en pantalla ya no vale.
      await cargar();
    } finally {
      guardando = false;
    }
  }
</script>

<div class="card">
  <div class="card-title">
    <span>{workOrderId ? `Facturar orden WO-${String(workOrderId).padStart(5, '0')}` : 'Nueva factura'}</span>
    <button class="btn btn-secondary" on:click={() => goto('/invoices')}>← Volver</button>
  </div>

  {#if errorMsg}
    <div class="alert-error" style="margin-bottom:15px;">{errorMsg}</div>
  {/if}

  {#if cargando}
    <p style="color:var(--text-muted);">Cargando…</p>

  {:else if !workOrderId}
    <p style="color:var(--text-muted);">
      Solo se factura lo que ya se entregó. Elija la orden cuyas entregas quiere cobrar.
    </p>

    <label style="display:flex;gap:8px;align-items:center;margin:12px 0;">
      <input type="checkbox" bind:checked={soloRecientes} on:change={cargar} />
      <span style="font-size:.9em;color:var(--text-muted);">
        Solo entregas de los últimos {DIAS_RECIENTES} días
      </span>
    </label>

    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th style="text-align:right;">Entregas pendientes</th>
            <th style="text-align:right;">Importe</th>
            <th style="text-align:right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {#each orders as o}
            <tr>
              <td style="font-weight:600;color:var(--accent-active);">WO-{String(o.id).padStart(5, '0')}</td>
              <td>{o.client_name || '—'}</td>
              <td style="color:var(--text-muted);">{o.date || '—'}</td>
              <td style="text-align:right;">{o.pendientes}</td>
              <td style="text-align:right;">${fmt(o.total_pendiente)}</td>
              <td style="text-align:right;">
                <button class="btn btn-primary btn-sm"
                        on:click={() => goto(`/invoices/new?wo=${o.id}`)}>Facturar</button>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">
                No hay entregas pendientes de facturar.
                {#if soloRecientes}Pruebe a desmarcar el filtro de fecha.{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

  {:else if conduces.length === 0}
    <p style="text-align:center;padding:30px;color:var(--text-muted);">
      Esta orden no tiene entregas pendientes de facturar.
    </p>

  {:else}
    <h4 style="margin:0 0 10px;">Entregas a incluir</h4>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th style="width:40px;"></th>
            <th>Conduce</th>
            <th>Fecha</th>
            <th style="text-align:right;">Líneas</th>
            <th style="text-align:right;">Importe</th>
          </tr>
        </thead>
        <tbody>
          {#each conduces as c}
            <tr>
              <td>
                <input type="checkbox" checked={seleccion.has(c.id)}
                       on:change={() => alternar(c.id)}
                       aria-label={`Incluir COND-${String(c.id).padStart(5, '0')}`} />
              </td>
              <td style="font-weight:600;color:var(--accent-active);">COND-{String(c.id).padStart(5, '0')}</td>
              <td>{c.date || '—'}</td>
              <td style="text-align:right;">{c.lineas}</td>
              <td style="text-align:right;">${fmt(c.total)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <h4 style="margin:20px 0 10px;">Líneas de la factura</h4>
    <div class="table-wrapper">
      <table class="table">
        <thead>
          <tr>
            <th>Artículo</th>
            <th style="text-align:right;">Cantidad</th>
            <th style="text-align:right;">Precio</th>
            <th style="text-align:right;">Importe</th>
          </tr>
        </thead>
        <tbody>
          {#each lineas as l}
            <tr>
              <td>{l.description || '—'}</td>
              <td style="text-align:right;">{l.quantity}</td>
              <td style="text-align:right;">${fmt(l.price)}</td>
              <td style="text-align:right;font-weight:600;">${fmt(l.total)}</td>
            </tr>
          {:else}
            <tr>
              <td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted);">
                Marque al menos una entrega.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="info-row" style="margin-top:20px;">
      <div class="field">
        <label for="fecha">Fecha</label>
        <input id="fecha" class="form-control" type="date" bind:value={fecha} />
      </div>
      <div class="field">
        <label for="vence">Vencimiento</label>
        <input id="vence" class="form-control" type="date" bind:value={vencimiento} />
      </div>
      <div class="field">
        <label for="desc">Descuento</label>
        <input id="desc" class="form-control" type="number" min="0" step="0.01" bind:value={descuento} />
        <small style="color:var(--text-muted);">Heredado de las entregas; editable.</small>
      </div>
      <div class="field">
        <label for="imp">ITBIS</label>
        <input id="imp" class="form-control" type="number" min="0" step="0.01" bind:value={impuesto} />
      </div>
      <div class="field field-lg">
        <label for="notas">Notas</label>
        <input id="notas" class="form-control" bind:value={notas} />
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:30px;margin-top:20px;font-size:1.05em;">
      <span>Subtotal <strong>${fmt(subtotal)}</strong></span>
      <span>Descuento <strong>−${fmt(rebaja)}</strong></span>
      <span>ITBIS <strong>${fmt(impuestoNum)}</strong></span>
      <span style="font-size:1.2em;">Total <strong>${fmt(total)}</strong></span>
    </div>

    {#if excede}
      <div class="alert-error" style="margin-top:15px;">
        El descuento no puede superar el subtotal.
      </div>
    {/if}

    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px;">
      <button class="btn btn-secondary" on:click={() => goto('/invoices')}>Cancelar</button>
      <button class="btn btn-primary"
              disabled={guardando || excede || seleccion.size === 0 || lineas.length === 0}
              on:click={emitir}>
        {guardando ? 'Emitiendo…' : 'Emitir factura'}
      </button>
    </div>
  {/if}
</div>

<style>
  /* `--accent-active`, no `--primary`: en oscuro el acento como LETRA da 3.08:1
     sobre la tarjeta y no pasa AA. El activo da 7.34:1 en oscuro y 9.93:1 en
     claro. Desktop tiene el mismo fallo en otras pantallas; queda anotado. */

  /* Mismo idioma de formulario que el resto de Desktop: `.info-row` de campos
     con `.form-control`, definidos en cada pagina. */
  .info-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field    { display: flex; flex-direction: column; min-width: 150px; }
  .field-lg { flex: 1.5; min-width: 220px; }
  .field label { font-size: .82rem; font-weight: 600; margin-bottom: 4px; }
  .field small { margin-top: 4px; }
</style>
