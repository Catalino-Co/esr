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
    // Volver: una flecha a la izquierda. Sustituye al emoji ⬅️ que las diez
    // pantallas de Ajustes de ESR Pro repetian a mano, y que cada sistema
    // operativo dibuja distinto y en color.
    back: ['M19 12H5', 'M12 19l-7-7 7-7'],
    edit: [
      'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
      'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'
    ],
    // Seleccion multiple: una lista con las dos primeras marcadas. Es el
    // `list-checks` de Lucide, y dice lo que el modo hace —marcar filas de una
    // lista— mejor que una casilla suelta, que se confundiria con un campo.
    listChecks: [
      'M3 17l2 2 4-4',
      'M3 7l2 2 4-4',
      'M13 6h8',
      'M13 12h8',
      'M13 18h8'
    ],
    // Confirmar. El visto de Lucide, un solo trazo.
    check: ['M20 6 9 17l-5-5'],
    // Descartar. La equis, para lo que cancela o cierra.
    x: ['M18 6 6 18', 'M6 6l12 12'],
    // Recargar: las dos flechas en circulo. Se dibuja con arcos y no con un
    // circulo entero porque hacen falta los huecos donde van las puntas.
    refresh: [
      'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 6.36 2.64L21 8',
      'M21 3v5h-5',
      'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.36-2.64L3 16',
      'M3 21v-5h5'
    ],
    // Historial: un reloj con la aguja marcando.
    history: ['M12 21a9 9 0 1 0-9-9', 'M3 12l-.5-3M3 12l3-.5', 'M12 7v5l3 2'],
    // Movimiento de existencias: una flecha que entra y otra que sale.
    stock: [
      'M12 3v18',
      'M8 7l4-4 4 4',
      'M16 17l-4 4-4-4'
    ],
    // Imprimir: la bandeja, el cuerpo y el papel saliendo. Sustituye al emoji
    // 🖨️ de la lista de cotizaciones de ESR Pro.
    printer: [
      'M6 9V2h12v7',
      'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
      'M6 14h12v8H6z'
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
