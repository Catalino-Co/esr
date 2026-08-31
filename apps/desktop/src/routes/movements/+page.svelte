<script>
  import { page } from '$app/stores';
  import { formatNumber, statusLabel } from '@esr/core';

  /**
   * Movimientos de existencias: que entro, que salio y quien lo movio.
   *
   * Pantalla propia y no un dialogo dentro de Inventario: quitando el filtro de
   * articulo se ve el almacen entero, que es la mitad de para que sirve. El
   * boton de la fila la abre ya filtrada.
   *
   * Gemela de `/movements` en ESR Cloud.
   */

  /**
   * Los tipos que se ofrecen, en dos familias.
   *
   * Conviven a proposito: las MANUALES las escribe la pantalla de Inventario y
   * las OPERATIVAS llevan escribiendolas conduces y ordenes desde antes.
   * Separarlas seria mentir sobre por que se movio el stock. Las etiquetas
   * salen de `statusLabel`, que ya traduce los dos vocabularios.
   *
   * Pero guardan cosas distintas en `quantity`: las manuales, un DELTA con
   * signo; las operativas, una magnitud. Por eso el signo y el color solo se
   * pintan en las primeras: un «Entregado +1» se leeria como si el stock
   * hubiera SUBIDO al entregar, que es lo contrario de lo que paso.
   */
  const MANUALES = ['entrada', 'salida', 'ajuste'];

  const TIPOS = [
    { grupo: 'Manuales', valores: MANUALES },
    {
      grupo: 'Operativos',
      valores: [
        'delivered',
        'returned',
        'damaged',
        'lost',
        'reverso_delivered',
        'reverso_returned',
        'reverso_damaged',
        'reverso_lost'
      ]
    }
  ];

  /** `YYYY-MM-DD` en hora LOCAL: `toISOString()` daria el dia de UTC. */
  function fechaLocal(d) {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  /**
   * Los tres atajos de rango.
   *
   * «Esta semana» empieza en LUNES: `getDay()` devuelve 0 para el domingo, asi
   * que un `- getDay()` a secas daria la semana del domingo, que no es la
   * semana laboral de nadie aqui.
   */
  const RANGOS = [
    {
      clave: 'semana',
      label: 'Esta semana',
      calcular: () => {
        const hoy = new Date();
        const lunes = new Date(hoy);
        lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
        return [fechaLocal(lunes), fechaLocal(hoy)];
      }
    },
    {
      clave: 'mes',
      label: 'Este mes',
      calcular: () => {
        const hoy = new Date();
        return [fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fechaLocal(hoy)];
      }
    },
    {
      clave: 'anio',
      label: 'Este año',
      calcular: () => {
        const hoy = new Date();
        return [fechaLocal(new Date(hoy.getFullYear(), 0, 1)), fechaLocal(hoy)];
      }
    }
  ];

  const hoy = new Date();
  // Por defecto, el mes en curso: es la ventana con la que se trabaja a diario.
  let desde = fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  let hasta = fechaLocal(hoy);
  let almacenId = '';
  let tipo = '';

  let almacenes = [];
  let movimientos = [];
  let articulo = null;

  /**
   * El id del articulo se lee de forma REACTIVA, no en `onMount`.
   *
   * SvelteKit reutiliza el componente cuando solo cambia la query, asi que
   * `onMount` no se vuelve a ejecutar: ir del historial de un articulo al de
   * otro dejaria la pantalla enseñando el primero.
   */
  $: itemId = $page.url.searchParams.get('item') || '';
  let cargadoId;
  $: if (itemId !== cargadoId) {
    cargadoId = itemId;
    cargar();
  }

  $: rangoActivo =
    RANGOS.find((r) => {
      const [d, h] = r.calcular();
      return d === desde && h === hasta;
    })?.clave ?? '';

  async function cargar() {
    if (!window.api?.db) return;

    almacenes = await window.api.db.get(
      "SELECT id, name FROM warehouses WHERE is_active = 1 ORDER BY CASE WHEN code = 'PRIN' THEN 0 ELSE 1 END, name"
    );

    articulo = itemId
      ? await window.api.db.getOne('SELECT id, name, internal_code FROM items WHERE id = ?', [itemId])
      : null;

    await cargarMovimientos();
  }

  async function cargarMovimientos() {
    if (!window.api?.db) return;

    const where = [];
    const params = [];

    if (itemId) {
      where.push('m.item_id = ?');
      params.push(itemId);
    }
    if (almacenId) {
      where.push('m.warehouse_id = ?');
      params.push(almacenId);
    }
    if (tipo) {
      where.push('m.type = ?');
      params.push(tipo);
    }
    /*
     * `'localtime'` no es decorativo: SQLite escribe `CURRENT_TIMESTAMP` en UTC,
     * y el rango llega en hora local. Sin convertir, en Republica Dominicana
     * (UTC-4) un movimiento de las 21:00 se contaria en el dia siguiente y no
     * saldria al filtrar por hoy.
     */
    where.push("date(m.created_at, 'localtime') BETWEEN ? AND ?");
    params.push(desde, hasta);

    movimientos = await window.api.db.get(
      `SELECT m.id, m.type, m.quantity, m.notes,
              datetime(m.created_at, 'localtime') AS cuando,
              i.name AS item_name, i.internal_code AS item_code,
              w.name AS warehouse_name,
              COALESCE(u.name, u.username) AS user_name
         FROM stock_movements m
         LEFT JOIN items i ON i.id = m.item_id
         LEFT JOIN warehouses w ON w.id = m.warehouse_id
         LEFT JOIN users u ON u.id = m.user_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 200`,
      params
    );
  }

  function aplicarRango(rango) {
    [desde, hasta] = rango.calcular();
    cargarMovimientos();
  }

  function quitarFiltroArticulo() {
    // Se navega para que la URL diga la verdad y el guarda reactivo recargue.
    window.location.href = '/movements';
  }

  /** `YYYY-MM-DD HH:MM:SS` ya en local: se parte porque son dos columnas. */
  function partirMomento(valor) {
    if (!valor) return { fecha: '—', hora: '—' };
    const [f, h] = String(valor).split(' ');
    return { fecha: f || '—', hora: (h || '').slice(0, 5) || '—' };
  }
</script>

<div class="card">
  <div class="card-title" style="align-items: center; justify-content: space-between; display: flex; width: 100%;">
    <span>Movimientos</span>
    <a href="/items" class="btn btn-secondary btn-sm">Volver a Inventario</a>
  </div>

  {#if articulo}
    <div class="filtro-articulo">
      <span>
        Historial de <strong>{articulo.name}</strong>
        {#if articulo.internal_code}<span class="codigo">{articulo.internal_code}</span>{/if}
      </span>
      <!-- Quitar el filtro es lo que convierte esta pantalla en el diario del
           almacén entero, que es la mitad de para qué sirve. -->
      <button type="button" class="btn-link" on:click={quitarFiltroArticulo}>
        Ver todos los movimientos
      </button>
    </div>
  {/if}

  <div class="filtros">
    <div class="quick-range">
      <span class="quick-range-label">Rango rápido</span>
      {#each RANGOS as rango (rango.clave)}
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          class:activo={rangoActivo === rango.clave}
          on:click={() => aplicarRango(rango)}
        >
          {rango.label}
        </button>
      {/each}
    </div>

    <div class="campos">
      <label class="campo">
        <span>Desde</span>
        <input type="date" bind:value={desde} on:change={cargarMovimientos} />
      </label>
      <label class="campo">
        <span>Hasta</span>
        <input type="date" bind:value={hasta} on:change={cargarMovimientos} />
      </label>
      <label class="campo">
        <span>Almacén</span>
        <select bind:value={almacenId} on:change={cargarMovimientos}>
          <option value="">Todos</option>
          {#each almacenes as almacen (almacen.id)}
            <option value={String(almacen.id)}>{almacen.name}</option>
          {/each}
        </select>
      </label>
      <label class="campo">
        <span>Tipo</span>
        <select bind:value={tipo} on:change={cargarMovimientos}>
          <option value="">Todos</option>
          {#each TIPOS as familia (familia.grupo)}
            <optgroup label={familia.grupo}>
              {#each familia.valores as t (t)}
                <option value={t}>{statusLabel(t)}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </label>
    </div>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Ítem</th>
          <th>Almacén</th>
          <th>Tipo</th>
          <th>Responsable</th>
          <th class="num">Cantidad</th>
          <th>Observaciones</th>
        </tr>
      </thead>
      <tbody>
        {#each movimientos as mov (mov.id)}
          {@const momento = partirMomento(mov.cuando)}
          {@const conSigno = MANUALES.includes(mov.type)}
          <tr>
            <td class="momento">{momento.fecha}</td>
            <td class="momento">{momento.hora}</td>
            <td>
              {mov.item_name || '—'}
              {#if mov.item_code}<span class="codigo">{mov.item_code}</span>{/if}
            </td>
            <td>{mov.warehouse_name || '—'}</td>
            <td>{statusLabel(mov.type)}</td>
            <!-- Los movimientos anteriores a esta reforma no guardaban quién:
                 «Sistema» lo dice, inventar un responsable sería peor. -->
            <td>{mov.user_name || 'Sistema'}</td>
            <td
              class="num"
              class:entra={conSigno && mov.quantity > 0}
              class:sale={conSigno && mov.quantity < 0}
            >
              {conSigno && mov.quantity > 0 ? '+' : ''}{formatNumber(mov.quantity)}
            </td>
            <td class="notas">{mov.notes || '—'}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
              No hay movimientos en el rango elegido.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .filtro-articulo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    flex-wrap: wrap;
    padding: var(--sp-3) var(--sp-4);
    margin-bottom: var(--sp-4);
    background: var(--surface-sunken);
    border-radius: var(--border-radius);
    font-size: var(--font-sm);
  }

  .filtros {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin-bottom: var(--sp-4);
  }

  .quick-range {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* Sentence case, sin mayúsculas ni `letter-spacing`: es la regla 5 del
     sistema. Lo que la distingue de los botones es el tamaño y el color. */
  .quick-range-label {
    font-size: var(--font-xs);
    color: var(--text-secondary);
    margin-right: var(--sp-1);
  }

  /* El atajo puesto se marca con el borde, no con el color de acento: eso está
     reservado a la acción primaria de la pantalla. */
  .activo {
    border-color: var(--border-focus);
    font-weight: 600;
  }

  .campos {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  .campo {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--font-xs);
    color: var(--text-secondary);
    margin: 0;
  }

  .campo input,
  .campo select {
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    background: var(--panel-bg);
    color: var(--text-main);
    font-family: inherit;
    font-size: 0.9rem;
    outline: none;
  }

  .campo input:focus,
  .campo select:focus {
    border-color: var(--primary);
  }

  .codigo {
    font-size: var(--font-xs);
    color: var(--text-secondary);
    margin-left: var(--sp-2);
  }

  /* Una fecha partida en dos líneas —«2026-08-» / «30»— se lee fatal en una
     tabla que se recorre de arriba abajo. */
  .momento {
    white-space: nowrap;
  }

  .num {
    text-align: right;
    white-space: nowrap;
    font-weight: 600;
  }

  .entra {
    color: var(--success);
  }

  .sale {
    color: var(--danger);
  }

  .notas {
    color: var(--text-muted);
    font-size: 0.88rem;
  }
</style>
