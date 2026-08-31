<script>
  /**
   * Iconografia vectorial de ESR. La usan las DOS apps.
   *
   * Distinta de `@esr/ui/icons`, que son EMOJI: aquellos nombran secciones en
   * el menu y en las tarjetas de Configuracion, donde un glifo grande y de
   * color esta bien. Estos son para acciones dentro de una tabla de datos,
   * donde un emoji se dibuja distinto en cada sistema operativo y desentona.
   *
   * `stroke="currentColor"` es lo que hace que un icono herede el color del
   * boton que lo contiene —y por tanto su estado de hover, foco y peligro— sin
   * una sola regla de color aqui dentro.
   *
   * Va en sintaxis Svelte 4 (`export let`), como el resto de `@esr/ui`: ninguna
   * de las dos apps fuerza `compilerOptions.runes`, asi que un componente con
   * runas puede importarlo con normalidad.
   */

  /**
   * Trazados de 24x24, tomados del conjunto de Lucide (ISC), que es el mismo
   * lenguaje visual —trazo de 2, extremos redondeados— en las dos apps.
   */
  const PATHS = {
    edit: [
      'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
      'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'
    ],
    // Historial: un reloj con la aguja marcando.
    history: ['M12 21a9 9 0 1 0-9-9', 'M3 12l-.5-3M3 12l3-.5', 'M12 7v5l3 2'],
    // Movimiento de existencias: una flecha que entra y otra que sale.
    stock: [
      'M12 3v18',
      'M8 7l4-4 4 4',
      'M16 17l-4 4-4-4'
    ],
    trash: [
      'M3 6h18',
      'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
      'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
      'M10 11v6',
      'M14 11v6'
    ]
  };

  export let name;
  export let size = 16;

  $: trazados = PATHS[name] ?? [];
</script>

<!--
  `aria-hidden` SIEMPRE: un icono nunca es el nombre accesible de nada. Quien lo
  usa pone el `aria-label` en el <button>, que es lo que se anuncia. Sin esto, un
  boton de solo icono se lee como un boton sin nombre.
-->
<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#each trazados as d}
    <path {d} />
  {/each}
</svg>

<style>
  /* `block` y no el `inline` por defecto: un <svg> en linea se sienta sobre la
     linea base y deja unos pixeles de hueco debajo que descuadran el boton. */
  .icon {
    display: block;
    flex-shrink: 0;
  }
</style>
