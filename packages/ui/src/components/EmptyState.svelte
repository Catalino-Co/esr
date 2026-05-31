<script>
  export let message = 'No hay datos disponibles.';
</script>

<div class="empty-state">
  <slot>{message}</slot>
</div>

<style>
  .empty-state {
    text-align: center;
    color: var(--text-muted);
    padding: 30px;
  }
</style>
