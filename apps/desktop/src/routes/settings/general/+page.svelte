<script>
  import { onMount } from 'svelte';
  import { BackLink } from '@esr/ui';
  import { PERIODOS, PERIODO_LABELS, parsePeriodo } from '@esr/core';
  import { dangerModal } from '$lib/stores/dangerModal.js';
  import { toasts } from '$lib/stores/toasts.js';

  /**
   * Configuración › Generales.
   *
   * Valores que la aplicación PROPONE al trabajar. Separada de «Datos de la
   * Empresa» a propósito: aquella guarda lo que se IMPRIME —nombre, RNC,
   * dirección— y ésta lo que la aplicación sugiere. Mezclarlas obligaría a que
   * un cambio de tasa reescribiera el membrete.
   *
   * Gemela de `/settings/general` en ESR Cloud.
   */

  // `preload.cjs` solo se lee al arrancar Electron: el HMR no lo recarga. Sin
  // reiniciar, `window.api.settings.updateDefaults` es `undefined` y el
  // guardado fallaría en silencio.
  const SIN_PUENTE =
    'Reinicie ESR Pro para activar este ajuste: el puente con la base de datos cambió y no basta con recargar la ventana.';

  let tasa = 0;
  /** `ultimo` | `promedio3`. Con qué costo se valora lo que hay en el almacén. */
  let regla = 'ultimo';
  /** `mes` | `trimestre` | `anio`. La ventana con la que abre el listado de órdenes. */
  let ventana = 'mes';
  /** Ajuste APARTE del anterior, para el listado de cotizaciones. */
  let ventanaCotizaciones = 'mes';
  /** Ajuste APARTE de los dos anteriores, para el listado de facturas. */
  let ventanaFacturas = 'mes';
  /** Ajuste APARTE de los tres anteriores, para la Tabla del listado de eventos. */
  let ventanaEventos = 'mes';
  let guardando = false;

  onMount(async () => {
    if (!window.api?.settings) {
      dangerModal.show(SIN_PUENTE);
      return;
    }
    const fila = await window.api.settings.getCompany();
    tasa = Number(fila?.default_tax_rate) || 0;
    regla = fila?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';
    ventana = parsePeriodo(fila?.default_order_range);
    ventanaCotizaciones = parsePeriodo(fila?.default_quote_range);
    ventanaFacturas = parsePeriodo(fila?.default_invoice_range);
    ventanaEventos = parsePeriodo(fila?.default_event_range);
  });

  async function guardar() {
    const valor = Number(tasa);
    // El <input> ya lo acota, pero esto es lo que de verdad llama al
    // repositorio: una tasa negativa devolvería dinero y una del 150%
    // triplicaría el documento.
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      dangerModal.show('El impuesto debe ser un porcentaje entre 0 y 100.');
      return;
    }
    if (!window.api?.settings?.updateDefaults) {
      dangerModal.show(SIN_PUENTE);
      return;
    }

    guardando = true;
    try {
      const fila = await window.api.settings.updateDefaults({
        default_tax_rate: valor,
        default_valuation_rule: regla,
        default_order_range: ventana,
        default_quote_range: ventanaCotizaciones,
        default_invoice_range: ventanaFacturas,
        default_event_range: ventanaEventos
      });
      tasa = Number(fila?.default_tax_rate) || 0;
      regla = fila?.default_valuation_rule === 'promedio3' ? 'promedio3' : 'ultimo';
      ventana = parsePeriodo(fila?.default_order_range);
      ventanaCotizaciones = parsePeriodo(fila?.default_quote_range);
      ventanaFacturas = parsePeriodo(fila?.default_invoice_range);
      ventanaEventos = parsePeriodo(fila?.default_event_range);
      toasts.success('Ajustes generales guardados.');
    } catch (e) {
      dangerModal.show(String(e?.message || 'No se pudo guardar.'));
    } finally {
      guardando = false;
    }
  }
</script>

<div class="record-header">
  <div class="record-titulo">
    <BackLink href="/settings" label="Volver a Ajustes" />
    <h1>Generales</h1>
  </div>
</div>

<div class="card">
  <p class="panel-hint">
    Valores que la aplicación propone al trabajar. No son los datos que se imprimen: eso está en
    <a href="/settings/company">Datos de la Empresa</a>.
  </p>

  <div class="form-grid">
    <div class="form-field">
      <label for="tasa">Impuesto por defecto (%)</label>
      <!--
        `step="any"` y no `step="0.01"`: con un paso declarado, un valor que no
        sea múltiplo suyo da `stepMismatch` y el campo se marca inválido.
      -->
      <input id="tasa" type="number" min="0" max="100" step="any" bind:value={tasa} />
      <span class="field-hint">
        El ITBIS en República Dominicana es 18. Se propone en cada línea nueva de cotización y se
        puede cambiar en esa línea.
      </span>
    </div>

    <div class="form-field">
      <label for="valoracion">Valoración del inventario</label>
      <select id="valoracion" bind:value={regla}>
        <option value="ultimo">Último precio de compra</option>
        <option value="promedio3">Promedio de las 3 últimas compras</option>
      </select>
      <span class="field-hint">
        Con qué costo se valora lo que hay en el almacén. El costo sale de las entradas
        registradas; las que se hicieron sin costo no cuentan.
      </span>
    </div>

    <div class="form-field">
      <label for="ventana">Órdenes que se cargan</label>
      <select id="ventana" bind:value={ventana}>
        {#each PERIODOS as periodo (periodo)}
          <option value={periodo}>{PERIODO_LABELS[periodo]} en curso</option>
        {/each}
      </select>
      <span class="field-hint">
        La ventana de fechas con la que abre el listado de órdenes. Se puede cambiar en la
        propia pantalla, y para ver más de un año se teclean las fechas a mano.
      </span>
    </div>

    <div class="form-field">
      <label for="ventana-cotizaciones">Cotizaciones que se cargan</label>
      <select id="ventana-cotizaciones" bind:value={ventanaCotizaciones}>
        {#each PERIODOS as periodo (periodo)}
          <option value={periodo}>{PERIODO_LABELS[periodo]} en curso</option>
        {/each}
      </select>
      <span class="field-hint">
        La ventana de fechas con la que abre el listado de cotizaciones. Ajuste aparte del de
        órdenes.
      </span>
    </div>

    <div class="form-field">
      <label for="ventana-facturas">Facturas que se cargan</label>
      <select id="ventana-facturas" bind:value={ventanaFacturas}>
        {#each PERIODOS as periodo (periodo)}
          <option value={periodo}>{PERIODO_LABELS[periodo]} en curso</option>
        {/each}
      </select>
      <span class="field-hint">
        La ventana de fechas con la que abre el listado de facturas. Ajuste aparte de las
        anteriores.
      </span>
    </div>

    <div class="form-field">
      <label for="ventana-eventos">Eventos que se cargan</label>
      <select id="ventana-eventos" bind:value={ventanaEventos}>
        {#each PERIODOS as periodo (periodo)}
          <option value={periodo}>{PERIODO_LABELS[periodo]} en curso</option>
        {/each}
      </select>
      <span class="field-hint">
        La ventana de fechas con la que abre la Tabla del listado de eventos. El Calendario no
        usa este ajuste: siempre carga todos los eventos activos.
      </span>
    </div>
  </div>

  <div class="form-actions">
    <button class="btn btn-primary" on:click={guardar} disabled={guardando}>
      {guardando ? 'Guardando…' : 'Guardar cambios'}
    </button>
  </div>

  <p class="panel-hint aviso">
    Cambiar estos valores no toca ninguna cotización ya hecha ni ningún costo ya registrado.
  </p>
</div>

<style>
  /* Cabecera propia y no `.page-header`: el título de la PANTALLA vive en el
     topbar; éste es el nombre de la sección. */
  .record-header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-titulo {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .field-hint {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .aviso {
    margin: var(--sp-4) 0 0;
  }
</style>
