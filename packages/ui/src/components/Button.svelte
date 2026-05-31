<script>
  export let type = 'button';
  export let variant = 'primary';
  export let disabled = false;
</script>

<button class="btn btn-{variant}" {type} {disabled} on:click>
  <slot />
</button>
