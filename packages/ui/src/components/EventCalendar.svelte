<script>
  /**
   * Calendario mensual de eventos. Lo usan las DOS apps.
   *
   * Nacio dentro de la pantalla de eventos de ESR Pro y se saca aqui sin
   * cambiar su comportamiento. No arrastra ninguna dependencia: son 42 celdas
   * de CSS Grid y `Date` nativo. Meter una libreria de calendario por esto
   * seria pagar cientos de kilobytes por una rejilla.
   *
   * Va en sintaxis Svelte 4 (`export let`), como el resto de `@esr/ui`:
   * ninguna de las dos apps fuerza `compilerOptions.runes`, asi que una pantalla
   * con runas puede importarlo con normalidad.
   *
   * SIEMPRE 42 celdas (6 filas x 7). Con un numero variable de filas la rejilla
   * cambia de alto al pasar de mes y la pagina da un salto.
   */

  /**
   * Los eventos a pintar.
   * @type {Array<any>}
   */
  export let events = [];
  /**
   * Quien llama resuelve el color; aqui no se sabe de donde sale.
   *
   * El `@type` NO es adorno: sin el, TypeScript infiere la firma del valor por
   * defecto —cero argumentos— y rechaza cualquier funcion que reciba el evento.
   * @type {(evento: any) => string}
   */
  export let colorOf = () => '#6366f1';
  /**
   * Se dispara al pulsar un evento.
   * @type {(evento: any) => void}
   */
  export let onSelect = () => {};

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  let cursor = new Date();
  $: mes = cursor.getMonth();
  $: anio = cursor.getFullYear();

  /**
   * El dia de HOY en local, como cadena.
   *
   * `toISOString()` pasa por UTC, asi que al este de Greenwich por la noche
   * devuelve el dia siguiente y el recuadro de «hoy» se pinta en la casilla
   * equivocada. Se compone a mano con las partes locales.
   */
  /** @param {Date} fecha */
  function iso(fecha) {
    const m = String(fecha.getMonth() + 1).padStart(2, '0');
    const d = String(fecha.getDate()).padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }
  const HOY = iso(new Date());

  $: dias = construir(mes, anio, events);

  /**
   * @param {number} m   Mes, base cero.
   * @param {number} a   Anio.
   * @param {Array<any>} evs
   */
  function construir(m, a, evs) {
    const primerDia = new Date(a, m, 1).getDay();
    const enElMes = new Date(a, m + 1, 0).getDate();
    const celdas = [];

    // Relleno del mes anterior, para que el 1 caiga en su dia de la semana.
    const delAnterior = new Date(a, m, 0).getDate();
    for (let i = primerDia - 1; i >= 0; i -= 1) {
      celdas.push({ dia: delAnterior - i, delMes: false, fecha: null, eventos: [] });
    }

    for (let d = 1; d <= enElMes; d += 1) {
      const fecha = `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      celdas.push({
        dia: d,
        delMes: true,
        fecha,
        // Comparacion de cadena `YYYY-MM-DD`: es como lo guardan las dos bases.
        // OJO: un evento de varios dias solo aparece en su fecha de inicio.
        eventos: evs.filter((/** @type {any} */ e) => e.date === fecha)
      });
    }

    for (let i = 1; celdas.length < 42; i += 1) {
      celdas.push({ dia: i, delMes: false, fecha: null, eventos: [] });
    }
    return celdas;
  }

  function anterior() {
    cursor = new Date(anio, mes - 1, 1);
  }

  function siguiente() {
    cursor = new Date(anio, mes + 1, 1);
  }

  function hoy() {
    cursor = new Date();
  }
</script>

<div class="cal">
  <div class="cal-barra">
    <button type="button" class="btn btn-secondary btn-sm" on:click={anterior} aria-label="Mes anterior">
      ‹
    </button>
    <h3 class="cal-mes">{MESES[mes]} {anio}</h3>
    <div class="cal-barra-fin">
      <button type="button" class="btn btn-secondary btn-sm" on:click={hoy}>Hoy</button>
      <button type="button" class="btn btn-secondary btn-sm" on:click={siguiente} aria-label="Mes siguiente">
        ›
      </button>
    </div>
  </div>

  <div class="cal-rejilla">
    {#each ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as dia}
      <div class="cal-diasemana">{dia}</div>
    {/each}

    {#each dias as celda}
      <div class="cal-celda" class:fuera={!celda.delMes} class:hoy={celda.fecha === HOY}>
        <span class="cal-numero">{celda.dia}</span>
        <div class="cal-eventos">
          {#each celda.eventos as ev (ev.id)}
            <!--
              El color del tipo entra por `style` y no por clase: sale de la base
              de datos, asi que no hay forma de tenerlo en una hoja de estilos.
              `color-mix` en vez del truco de concatenar `22` al hexadecimal: aquel
              rompia con cualquier color que no fuera `#rrggbb` de seis digitos.
            -->
            <button
              type="button"
              class="cal-evento"
              style="--tono: {colorOf(ev)}"
              on:click={() => onSelect(ev)}
              title={ev.name}
            >
              {ev.name}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .cal-barra {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  .cal-barra-fin {
    display: flex;
    gap: var(--sp-2);
  }

  .cal-mes {
    margin: 0;
    font-size: var(--font-lg);
    font-weight: 600;
  }

  /* El `gap` de 1px sobre fondo de borde dibuja las lineas de la rejilla sin
     que cada celda tenga que llevar su propio borde y duplicarlos. */
  .cal-rejilla {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--border-radius-sm);
    overflow: hidden;
  }

  .cal-diasemana {
    padding: var(--sp-2);
    text-align: center;
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--text-muted);
    background: var(--surface);
  }

  .cal-celda {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-height: 6.25rem;
    padding: var(--sp-2);
    background: var(--surface);
  }

  .cal-celda.fuera {
    background: var(--surface-sunken);
    opacity: 0.5;
  }

  .cal-numero {
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--text-muted);
  }

  .cal-celda.hoy .cal-numero {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--accent);
    color: var(--text-on-accent);
  }

  .cal-eventos {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    max-height: 5rem;
  }

  .cal-evento {
    display: block;
    width: 100%;
    padding: 2px var(--sp-2);
    border: none;
    border-left: 3px solid var(--tono);
    border-radius: var(--border-radius-sm);
    background: color-mix(in srgb, var(--tono) 14%, transparent);
    color: var(--text-primary);
    font-size: var(--font-xs);
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .cal-evento:hover {
    background: color-mix(in srgb, var(--tono) 26%, transparent);
  }
</style>
