<script>
  export let show = false;
  export let title = "Vista Previa de Documento";
  export let pdfUrl = "";
  export let filename = "documento.pdf";

  function close() {
    show = false;
    pdfUrl = "";
  }

  function handleKeydown(e) {
    if (e.key === 'Escape' && show) close();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div class="modal-backdrop" on:click={close}>
    <div class="modal" on:click|stopPropagation>
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main); font-weight: 600;">{title}</h3>
        <button class="close-btn" on:click={close}>❌</button>
      </div>
      
      <div class="modal-body" style="padding: 0; height: 75vh; display: flex; flex-direction: column;">
        {#if pdfUrl}
          <!-- svelte-ignore a11y-missing-attribute -->
          <iframe 
            src={pdfUrl} 
            style="width: 100%; height: 100%; border: none; flex: 1;"
            title="PDF Preview"
          ></iframe>
        {:else}
          <div style="display: flex; justify-content: center; align-items: center; height: 100%; color: var(--text-muted);">
            Cargando vista previa...
          </div>
        {/if}
      </div>

      <div class="modal-footer" style="padding: 15px; border-top: 1px solid var(--border-color); display: flex; justify-content: flex-end; gap: 10px; background: var(--bg-color); border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
        <button class="btn btn-secondary" on:click={close}>Cerrar</button>
        {#if pdfUrl}
          <a class="btn btn-primary" href={pdfUrl} download={filename} style="text-decoration: none; display: flex; align-items: center; gap: 5px;" on:click={close}>
            ⏬ Descargar PDF
          </a>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(3px);
  }
  .modal {
    background: var(--bg-color);
    width: 90%;
    max-width: 900px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    display: flex;
    flex-direction: column;
    animation: modalIn 0.2s ease-out forwards;
  }
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid var(--border-color);
  }
  .close-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    opacity: 0.6;
    transition: 0.2s;
  }
  .close-btn:hover {
    opacity: 1;
    transform: scale(1.1);
  }
  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    font-size: 0.9rem;
    transition: 0.2s;
  }
  .btn-secondary {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-main);
  }
  .btn-secondary:hover {
    background: #f3f4f6;
  }
  .btn-primary {
    background: var(--primary);
    color: white;
  }
  .btn-primary:hover {
    filter: brightness(1.1);
  }
  
  @keyframes modalIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
