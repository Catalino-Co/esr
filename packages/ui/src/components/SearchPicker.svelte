<script>
  /**
   * Combobox de busqueda, compartido por las DOS apps.
   *
   * No existia ninguno: Desktop reimplementaba el patron a mano dos veces
   * (`work_orders/edit`, `quotations/edit`) y Cloud no tenia ninguno -sus
   * pantallas usan `<select>` planos-. Este es el unico, con dos modos:
   *
   *   - Modo LOCAL (`items`): filtra un arreglo ya cargado, entero, en el
   *     cliente. Es el modo tipico en Desktop y para catalogos pequeños.
   *   - Modo ASINCRONO (`search`): llama a `search(termino, signal)` con
   *     debounce y cancela la peticion en vuelo si llega una tecla nueva.
   *     Pensado para Cloud con catalogos grandes (clientes, cotizaciones).
   *
   * Reglas de compatibilidad OBLIGATORIAS -verificadas contra
   * `FormattedNumberField.svelte`/`PdfPreviewModal.svelte`, que ya se
   * consumen sin problema desde Cloud en runas Y desde Desktop en Svelte 4
   * clasico, porque ninguna de las dos apps activa `compilerOptions.runes`,
   * asi que TODO `packages/ui` compila en modo clasico-:
   *
   *   1. `export let` unicamente, nunca `$props`/`$state`.
   *   2. Props CALLBACK (`onselect`, `onclear`), nunca
   *      `createEventDispatcher`: un consumidor en runas no puede escuchar
   *      `on:evento` de un componente.
   *   3. Sin `<slot>` para los resultados: en su lugar, props de FUNCION
   *      (`getMain`/`getSub`/`getAside`) -un `<slot>` clasico no recibe bien
   *      un snippet de Svelte 5-.
   *   4. Par `name`/`form` opcional, igual que `FormattedNumberField`: deja
   *      usar este componente dentro de un `<form method="POST">` nativo de
   *      Cloud. Desktop simplemente no los pasa y lee `value` directo.
   */

  import Icon from './Icon.svelte';

  // ── Identidad y presentacion ──────────────────────────────────────────────
  export let label = '';
  export let id = undefined;
  export let placeholder = 'Buscar…';
  /** Nombre de icono de `Icon.svelte` para dentro de la caja (p.ej. 'search'). */
  export let icon = null;
  export let disabled = false;
  export let required = false;
  export let clearable = true;
  let className = '';
  export { className as class };

  // ── Valor ───────────────────────────────────────────────────────────────
  /** El OBJETO elegido (bindable). `null` = nada elegido. */
  export let value = null;
  /** El texto escrito (bindable, raramente hace falta leerlo desde fuera). */
  export let term = '';

  // ── Modo A: arreglo ya cargado ────────────────────────────────────────────
  export let items = [];
  export let filterFields = ['name'];

  // ── Modo B: busqueda asincrona ────────────────────────────────────────────
  /** `(termino, signal) => Promise<any[]>`. Si se pasa, activa el modo asincrono. */
  export let search = null;
  export let searchDelay = 250;
  export let minChars = 0;

  // ── Render de cada resultado ──────────────────────────────────────────────
  export let getKey = (o) => o?.id;
  export let getMain = (o) => o?.name ?? '';
  export let getSub = () => '';
  export let getAside = () => '';

  // ── Lista ─────────────────────────────────────────────────────────────────
  export let maxResults = 8;
  export let openOnFocus = true;
  export let emptyText = 'Sin resultados.';
  export let loadingText = 'Buscando…';

  // ── Formularios nativos de Cloud ──────────────────────────────────────────
  export let name = undefined;
  export let form = undefined;

  // ── Callbacks ─────────────────────────────────────────────────────────────
  export let onselect = null;
  export let onclear = null;

  const uid = `picker-${Math.random().toString(36).slice(2, 9)}`;
  $: inputId = id || uid;

  let abierto = false;
  let activo = -1;
  let buscando = false;
  let resultadosAsync = [];
  let temporizador = null;
  let controlEnVuelo = null;
  let tokenBusqueda = 0;

  $: modo = typeof search === 'function' ? 'async' : 'local';

  function filtrarLocal(lista, termino, campos) {
    const t = termino.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((item) =>
      campos.some((campo) => String(item?.[campo] ?? '').toLowerCase().includes(t))
    );
  }

  $: coincidencias = modo === 'local' ? filtrarLocal(items, term, filterFields) : resultadosAsync;
  $: resultados = coincidencias.slice(0, maxResults);
  $: sobrantes = Math.max(0, coincidencias.length - resultados.length);

  async function buscarAsync() {
    controlEnVuelo?.abort?.();
    const control = new AbortController();
    controlEnVuelo = control;
    const miToken = ++tokenBusqueda;
    buscando = true;
    try {
      const lista = await search(term.trim(), control.signal);
      // Un token distinto significa que llego una tecla nueva mientras esta
      // respuesta viajaba: descartarla evita que una busqueda VIEJA pise a
      // una mas reciente que ya volvio antes.
      if (miToken !== tokenBusqueda) return;
      resultadosAsync = lista || [];
      activo = resultadosAsync.length ? 0 : -1;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      resultadosAsync = [];
    } finally {
      if (miToken === tokenBusqueda) buscando = false;
    }
  }

  function alTeclear(evento) {
    term = evento.currentTarget.value;
    if (value) {
      value = null;
      onclear?.();
    }
    activo = -1;
    abierto = true;

    if (modo !== 'async') return;
    clearTimeout(temporizador);
    if (term.trim().length < minChars) {
      resultadosAsync = [];
      buscando = false;
      return;
    }
    temporizador = setTimeout(buscarAsync, searchDelay);
  }

  function alEnfocar() {
    if (disabled) return;
    if (openOnFocus || term.trim()) abierto = true;
    if (modo === 'async' && term.trim().length >= minChars && !resultadosAsync.length) buscarAsync();
  }

  /**
   * Retardo de blur: deja que el `onmousedown` de una opcion dispare ANTES de
   * que el cierre por blur la quite del DOM -si se cerrara en `blur` sin mas,
   * el click sobre la opcion nunca llegaria a registrarse-. Mismo truco ya
   * probado en los combos de cliente de Desktop.
   */
  function alPerderFoco() {
    setTimeout(() => {
      abierto = false;
    }, 180);
  }

  function elegir(item) {
    value = item;
    term = getMain(item);
    abierto = false;
    activo = -1;
    onselect?.(item);
  }

  function limpiar() {
    value = null;
    term = '';
    abierto = false;
    onclear?.();
  }

  function alPulsarTecla(evento) {
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      if (!abierto) {
        abierto = true;
        return;
      }
      if (resultados.length) activo = (activo + 1) % resultados.length;
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      if (resultados.length) activo = (activo - 1 + resultados.length) % resultados.length;
    } else if (evento.key === 'Enter') {
      if (activo >= 0 && resultados[activo]) {
        evento.preventDefault();
        elegir(resultados[activo]);
      }
    } else if (evento.key === 'Escape') {
      abierto = false;
    } else if (evento.key === 'Tab') {
      abierto = false;
    }
  }

  $: if (activo >= 0 && typeof document !== 'undefined') {
    document.getElementById(`${uid}-opt-${activo}`)?.scrollIntoView({ block: 'nearest' });
  }

  // Si `value` cambia desde FUERA -se limpia el formulario, se preselecciona
  // algo tras cargar- el texto visible tiene que reflejarlo.
  let ultimoValorExterno = value;
  $: if (value !== ultimoValorExterno) {
    ultimoValorExterno = value;
    term = value ? getMain(value) : '';
  }
</script>

<div class="picker {className}">
  {#if label}
    <label class="picker-label" for={inputId}>
      {label}{#if required}<span class="picker-requerido"> *</span>{/if}
    </label>
  {/if}

  <div class="picker-caja" class:picker-caja--on={!!value} class:picker-caja--disabled={disabled}>
    {#if icon}<span class="picker-icono"><Icon name={icon} size={16} /></span>{/if}
    <input
      id={inputId}
      class="picker-input"
      type="text"
      role="combobox"
      autocomplete="off"
      {placeholder}
      {disabled}
      {required}
      value={term}
      oninput={alTeclear}
      onfocus={alEnfocar}
      onblur={alPerderFoco}
      onkeydown={alPulsarTecla}
      aria-expanded={abierto}
      aria-controls="{uid}-lista"
      aria-autocomplete="list"
      aria-activedescendant={activo >= 0 ? `${uid}-opt-${activo}` : undefined}
    />
    {#if value && clearable && !disabled}
      <button type="button" class="picker-clear" onclick={limpiar} aria-label="Quitar selección">
        <Icon name="x" size={14} />
      </button>
    {/if}
  </div>

  {#if value && getSub(value)}
    <p class="picker-elegido-sub">{getSub(value)}</p>
  {/if}

  {#if abierto && !disabled}
    <ul class="picker-dropdown" id="{uid}-lista" role="listbox">
      {#if resultados.length}
        {#each resultados as item, indice (getKey(item))}
          <li
            id="{uid}-opt-{indice}"
            class="picker-opcion"
            class:picker-opcion--activa={indice === activo}
            role="option"
            aria-selected={indice === activo}
            onmousedown={() => elegir(item)}
          >
            <span class="picker-opcion-cuerpo">
              <span class="picker-opcion-main">{getMain(item)}</span>
              {#if getSub(item)}<span class="picker-opcion-sub">{getSub(item)}</span>{/if}
            </span>
            {#if getAside(item)}<span class="picker-opcion-aside">{getAside(item)}</span>{/if}
          </li>
        {/each}
        {#if sobrantes > 0}
          <li class="picker-mas" aria-hidden="true">+{sobrantes} más… afine la búsqueda</li>
        {/if}
      {:else if modo === 'async' && term.trim().length < minChars}
        <li class="picker-vacio">Escriba al menos {minChars} caracteres.</li>
      {:else}
        <li class="picker-vacio">{buscando ? loadingText : emptyText}</li>
      {/if}
    </ul>
  {/if}

  {#if name}
    <input type="hidden" {name} {form} value={value ? getKey(value) : ''} />
  {/if}
</div>

<style>
  .picker {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }

  .picker-label {
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .picker-requerido {
    color: var(--danger-text);
  }

  .picker-caja {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    background: var(--bg-input);
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .picker-caja:focus-within {
    border-color: var(--border-focus);
    box-shadow: var(--focus-ring);
  }

  .picker-caja--on {
    border-color: var(--accent-border);
    background: var(--accent-subtle);
  }

  .picker-caja--disabled {
    opacity: 0.6;
  }

  .picker-icono {
    display: flex;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .picker-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-family: inherit;
    font-size: var(--font-sm);
    color: var(--text-primary);
  }

  .picker-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: var(--border-radius-sm);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .picker-clear:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .picker-elegido-sub {
    margin: 0;
    padding-left: var(--sp-3);
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .picker-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 60;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 18rem;
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    box-shadow: var(--shadow-modal);
  }

  .picker-opcion {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }

  .picker-opcion:last-child {
    border-bottom: none;
  }

  .picker-opcion:hover,
  .picker-opcion--activa {
    background: var(--bg-hover);
  }

  .picker-opcion-cuerpo {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .picker-opcion-main {
    font-size: var(--font-sm);
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-opcion-sub {
    font-size: var(--font-xs);
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-opcion-aside {
    flex-shrink: 0;
    font-size: var(--font-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .picker-vacio,
  .picker-mas {
    padding: var(--sp-3);
    font-size: var(--font-xs);
    color: var(--text-secondary);
    text-align: center;
  }

  @media (max-width: 720px) {
    .picker-caja {
      min-height: 44px;
    }
    .picker-input {
      font-size: 16px; /* evita el zoom automatico de iOS al enfocar */
    }
  }

  @media (max-width: 560px) {
    .picker-dropdown {
      max-height: 50vh;
    }
    .picker-opcion {
      min-height: 44px;
    }
    .picker-opcion {
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
  }
</style>
