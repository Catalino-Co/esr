<script>
  export let show = false;
  export let title = "Modal Title";
  export let maxWidth = "500px";
  
  
  function close() {
    show = false;
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" on:click={close}>
    <div class="modal-content" style="max-width: {maxWidth}; width: 100%;" on:click|stopPropagation>
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main); font-weight: 600;">{title}</h3>
        <button class="modal-close" on:click={close}>&times;</button>
      </div>
      <div class="modal-body">
        <slot></slot>
      </div>
      <div class="modal-footer">
        <slot name="footer">
          <button class="btn btn-secondary" on:click={close}>Cerrar</button>
        </slot>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  .modal-content {
    background: var(--panel-bg);
    border-radius: var(--radius-md);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-md);
    animation: fadeIn 0.2s ease-out;
  }
  .modal-header {
    padding: 20px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: var(--text-muted);
    cursor: pointer;
  }
  .modal-close:hover { color: var(--text-main); }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
    flex: 1;
  }
  .modal-footer {
    padding: 20px;
    border-top: 1px solid var(--border-color);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
