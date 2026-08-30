<script>
  /**
   * Select con punto de color y chevron propio. Espejo del de Cloud: mismo
   * marcado y mismas clases, que viven en @esr/config/theme.css. Sin `<style>`
   * propio — una regla local iria sin capa y dejaria inerte la compartida.
   *
   * Es un `<select>` nativo con `appearance: none`, no un menu a medida:
   * conserva el teclado, el lector de pantalla y el desplegable del sistema.
   */
  export let value = '';
  /** { value, label, tone? } — tone pinta el punto: ok | warn | off | none */
  export let options = [];
  export let label = '';
  export let onchange = () => {};

  $: selected = options.find((o) => String(o.value) === String(value));
  $: tone = selected?.tone ?? 'none';
</script>

<label class="status-select" aria-label={label || undefined}>
  {#if tone !== 'none'}
    <span class="dot dot--{tone}" aria-hidden="true"></span>
  {/if}

  <!-- Los `value` van forzados a cadena: Svelte empareja el valor del select
       con el de la opcion por identidad, y un 1 numerico no coincide con el
       "1" que llega del estado, asi que no se marcaba ninguna. -->
  <select value={String(value)} on:change={onchange}>
    {#each options as option (option.value)}
      <option value={String(option.value)}>{option.label}</option>
    {/each}
  </select>

  <span class="chevron" aria-hidden="true">
    <svg viewBox="0 0 12 12" width="12" height="12">
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </span>
</label>
