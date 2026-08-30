<script>
  import StatusSelect from './StatusSelect.svelte';

  /**
   * Barra de filtros unica de los listados. Espejo de la de Cloud: mismo
   * marcado y mismas clases, que viven en @esr/config/theme.css.
   *
   * UNA fila horizontal, no tres controles apilados: el buscador crece y los
   * selects tienen base fija. Sin boton de buscar: filtra en vivo.
   *
   * Diferencia con Cloud, y es de fondo: alli los filtros viajan en la URL
   * porque el listado lo pagina el servidor. Aqui Desktop ya carga todas las
   * filas de SQLite, asi que el filtrado es en memoria y el estado se queda en
   * la pantalla. Por eso este componente AVISA en vez de navegar.
   */

  /** `{ placeholder, value }`, o `null` si la pantalla no busca. */
  export let search = null;
  /** `[{ name, label, value, options, width? }]` */
  export let selects = [];
  export let onSearch = () => {};
  export let onSelect = () => {};
  export let delay = 300;

  let timer = null;

  // Escribir espera; elegir en un select es una decision cerrada y va directa.
  function alEscribir(event) {
    const valor = event.currentTarget.value;
    clearTimeout(timer);
    timer = setTimeout(() => onSearch(valor), delay);
  }

  const alElegir = (name) => (event) => onSelect(name, event.currentTarget.value);
</script>

<div class="filters">
  {#if search}
    <div class="filters-search">
      <span class="filters-search-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <input
        type="search"
        placeholder={search.placeholder}
        value={search.value ?? ''}
        aria-label={search.placeholder}
        on:input={alEscribir}
      />
    </div>
  {/if}

  {#each selects as select (select.name)}
    <div class="filters-control" style={select.width ? `flex-basis:${select.width}` : undefined}>
      <StatusSelect
        value={select.value}
        options={select.options}
        label={select.label}
        onchange={alElegir(select.name)}
      />
    </div>
  {/each}

  <div class="filters-actions">
    <slot name="actions" />
  </div>
</div>
