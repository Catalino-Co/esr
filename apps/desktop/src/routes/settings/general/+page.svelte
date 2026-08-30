<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

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
  let guardando = false;
  let mensaje = '';
  let error = '';

  onMount(async () => {
    if (!window.api?.settings) {
      error = SIN_PUENTE;
      return;
    }
    const fila = await window.api.settings.getCompany();
    tasa = Number(fila?.default_tax_rate) || 0;
  });

  async function guardar() {
    const valor = Number(tasa);
    // El <input> ya lo acota, pero esto es lo que de verdad llama al
    // repositorio: una tasa negativa devolvería dinero y una del 150%
    // triplicaría el documento.
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
      error = 'El impuesto debe ser un porcentaje entre 0 y 100.';
      mensaje = '';
      return;
    }
    if (!window.api?.settings?.updateDefaults) {
      error = SIN_PUENTE;
      return;
    }

    guardando = true;
    error = '';
    mensaje = '';
    try {
      const fila = await window.api.settings.updateDefaults({ default_tax_rate: valor });
      tasa = Number(fila?.default_tax_rate) || 0;
      mensaje = 'Ajustes generales guardados.';
    } catch (e) {
      error = String(e?.message || 'No se pudo guardar.');
    } finally {
      guardando = false;
    }
  }
</script>

<div class="record-header">
  <div class="record-titulo">
    <button class="btn btn-secondary btn-sm" on:click={() => goto('/settings')}>← Ajustes</button>
    <h1>Generales</h1>
  </div>
</div>

<div class="card">
  <p class="panel-hint">
    Valores que la aplicación propone al trabajar. No son los datos que se imprimen: eso está en
    <a href="/settings/company">Datos de la Empresa</a>.
  </p>

  {#if error}<div class="alert alert-danger">{error}</div>{/if}
  {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}

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
  </div>

  <div class="form-actions">
    <button class="btn btn-primary" on:click={guardar} disabled={guardando}>
      {guardando ? 'Guardando…' : 'Guardar cambios'}
    </button>
  </div>

  <p class="panel-hint aviso">Cambiar este valor no toca ninguna cotización ya hecha.</p>
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
