<script>
  /**
   * Visor de PDF. Lo usan las DOS apps.
   *
   * Va en sintaxis Svelte 4 (`export let`) y eso es compatible a proposito:
   * ninguna de las dos apps fuerza `compilerOptions.runes`, asi que Svelte 5 lo
   * compila en modo legacy y un componente con runas puede importarlo y hacer
   * `bind:show` con normalidad. Cloud ya consume otros `.svelte` de este
   * paquete. Mantener UN solo visor es lo que hace que las dos apps enseñen el
   * mismo dialogo.
   *
   * API publica, que NO cambia: `show` (bindable), `title`, `pdfUrl`,
   * `filename`. Siete pantallas dependen de ella.
   */
  export let show = false;
  export let title = 'Vista previa del documento';
  export let pdfUrl = '';
  export let filename = 'documento.pdf';

  function close() {
    show = false;
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && show) close();
  }

  /**
   * Todo lo que un dialogo necesita y el CSS no puede dar: foco al abrir, foco
   * de vuelta al cerrar, trampa de tabulador y bloqueo del scroll del fondo.
   * Nada de esto existia aqui.
   *
   * Va en una ACCION y no en `onMount`: la accion se monta y se destruye con el
   * elemento, que es exactamente la vida del bloque `{#if show}`. Con `onMount`
   * habria que sincronizar cada apertura a mano, y ese es el camino por el que
   * se olvida devolver `document.body.style.overflow`.
   */
  function dialogo(nodo) {
    const disparador = document.activeElement;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    nodo.focus();

    function alTabular(evento) {
      if (evento.key !== 'Tab') return;
      const focusables = nodo.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      // El <iframe> entra en la lista a proposito: al pulsarlo se lleva el foco
      // y pasa a ser el `activeElement`; sin el, la trampa se abriria ahi.
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    nodo.addEventListener('keydown', alTabular);

    return {
      destroy() {
        nodo.removeEventListener('keydown', alTabular);
        document.body.style.overflow = overflowPrevio;
        disparador?.focus?.();
        // `doc.output('bloburl')` reserva el blob hasta que alguien lo suelte, y
        // no lo soltaba nadie: cada vista previa dejaba el PDF entero retenido
        // en memoria hasta recargar la aplicacion.
        if (typeof pdfUrl === 'string' && pdfUrl.startsWith('blob:')) {
          URL.revokeObjectURL(pdfUrl);
        }
      }
    };
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" on:click={close}>
    <div
      class="modal modal-pdf"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      use:dialogo
      on:click|stopPropagation
    >
      <div class="modal-header">
        <h2 class="modal-title">{title}</h2>
        <button type="button" class="modal-close" on:click={close} aria-label="Cerrar">✕</button>
      </div>

      <div class="modal-body">
        {#if pdfUrl}
          <iframe src={pdfUrl} class="pdf-frame" title={title}></iframe>
        {:else}
          <p class="empty-state">Generando la vista previa…</p>
        {/if}
      </div>

      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" on:click={close}>Cerrar</button>
        {#if pdfUrl}
          <!-- SIN `on:click={close}`: cerrar revoca el object URL en el
               `destroy` de la accion, y hacerlo en el mismo gesto puede
               cancelar la descarga que acaba de empezar. -->
          <a class="btn btn-primary" href={pdfUrl} download={filename}>Descargar PDF</a>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Todo el vocabulario —`.modal-backdrop`, `.modal`, `.modal-header`,
     `.modal-title`, `.modal-close`, `.modal-footer`, `.btn-*`— sale de
     @esr/config/theme.css. Este archivo tenia sus propios `.btn`,
     `.btn-primary` y `.btn-secondary`, y como un <style> de componente va sin
     capa y gana siempre, ESO era lo que hacia que el visor no se pareciera al
     resto del sistema.

     Aqui solo queda el tamaño, que es lo unico realmente propio: `.modal` de
     theme.css limita a 560px y `.modal-lg` a 800, y un PDF a esa anchura se lee
     a la mitad. */
  .modal-pdf {
    max-width: 1000px;
    height: 88vh;
    max-height: 88vh;
  }

  /* Un iframe tiene que sangrar hasta el borde, y `.modal-body` lleva
     `padding: var(--sp-6)`. Encadenado a `.modal-pdf` para no alcanzar a los
     demas dialogos del sistema. */
  .modal-pdf .modal-body {
    padding: 0;
    display: flex;
  }

  .pdf-frame {
    flex: 1;
    width: 100%;
    border: 0;
  }
</style>
