<script>
  /**
   * Volver a la pantalla de la que se vino. La usan las DOS apps.
   *
   * Nace para acabar con once copias del mismo gesto: diez pantallas de Ajustes
   * de ESR Pro repetian byte a byte el mismo enlace con un emoji de flecha, con
   * cuatro cuerpos distintos de `.btn-icon` en su CSS por pagina, y una
   * duodecima usaba un boton de texto. En Cloud vivia en el layout de
   * Configuracion, con icono y texto.
   *
   * Solo el ICONO, sin texto: la cabecera de la pantalla ya dice donde esta uno,
   * y repetirlo aqui era decirlo por tercera vez en dos centimetros.
   *
   * El glifo es VECTORIAL y no el emoji ⬅️ que habia antes. Un emoji lo dibuja
   * cada sistema operativo a su manera —y en color— asi que desentonaba junto a
   * un boton gris; este hereda `currentColor` y va igual en Windows y en macOS.
   *
   * Los estilos viven AQUI y no en `theme.css` a proposito: el bloque de estilos
   * de un componente va sin capa y gana siempre, asi que no hay que preocuparse
   * de la cascada; y sobre todo no choca con los `.btn-icon` sueltos que ESR Pro
   * todavia tiene en el CSS de cada pagina para los botones de fila.
   *
   * Ojo al escribir aqui: una etiqueta HTML literal dentro de este comentario
   * —la de estilos, sin ir mas lejos— confunde al preprocesador de
   * `svelte-check`, que la busca sin mirar si esta comentada y luego se queda
   * esperando un cierre que nunca llega. El compilador de verdad no se inmuta,
   * asi que el build pasa y el error solo sale en el `check`.
   *
   * Va en sintaxis Svelte 4 (`export let`), como el resto de `@esr/ui`.
   */
  import Icon from './Icon.svelte';

  /** A donde vuelve. */
  export let href;
  /**
   * Lo que anuncia el lector de pantalla, y lo que sale en el `title`. Un glifo
   * NO es un nombre accesible: sin esto el enlace se lee como «enlace», a secas.
   * Por eso no tiene valor por defecto util y quien lo use tiene que decirlo.
   */
  export let label = 'Volver';
</script>

<a class="back-link" {href} aria-label={label} title={label}>
  <Icon name="back" size={18} />
</a>

<style>
  .back-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* Cuadrado: es un objetivo tactil, no una linea de texto. 32px queda por
       debajo de los 44 recomendados, pero es lo que miden el resto de acciones
       de icono del sistema y romper esa escala aqui solo desentonaria. */
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border: 1px solid transparent;
    border-radius: var(--border-radius-sm, 6px);
    /* `color` explicito y no heredado: el `a { color: inherit }` que los dos
       `app.css` traen sin capa haria que el icono tomara el color del texto que
       lo rodea, que en una cabecera es casi negro. */
    color: var(--text-secondary);
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .back-link:hover {
    background: var(--bg-hover, var(--surface-sunken));
    color: var(--text-primary);
  }

  .back-link:focus-visible {
    outline: none;
    border-color: var(--border-focus);
    box-shadow: var(--focus-ring);
  }
</style>
