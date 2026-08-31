<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    ACTIVE_INVENTORY_ORDER_STATUSES,
    formatDate,
    formatMoney,
    formatNumber,
    formatRelativeTime,
    statusBadgeClass,
    statusLabel
  } from '@esr/core';
  import { EmptyState } from '@esr/ui';

  /**
   * Portada de ESR Pro.
   *
   * Misma distribucion que la de ESR Cloud —franja de seis metricas partida por
   * hairlines, dos paneles y uno a ancho completo— usando el vocabulario
   * compartido de `@esr/config/theme.css`. Antes eran dos portadas que no se
   * parecian en nada: esta tenia cuatro tarjetas con borde de color y una tabla.
   *
   * Va en sintaxis Svelte CLASICA (`let`, `$:`, `on:`), como el resto de Desktop.
   */

  const PERIODOS = [7, 30, 90];
  let dias = 30;

  /**
   * `YYYY-MM-DD` en hora LOCAL.
   *
   * `toISOString()` da el dia de UTC, y esa era la version anterior: en Republica
   * Dominicana (UTC-4), a partir de las 20:00 el dashboard ya creia que era
   * mañana, asi que la ventana de «proximos dias» arrancaba un dia tarde y un
   * evento de HOY no salia. Es el mismo arreglo que lleva Cloud.
   */
  function fechaLocal(d) {
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }

  const ESTADOS_COTIZACION_ABIERTA = ['borrador', 'enviada', 'aprobada'];
  const ESTADOS_ORDEN_ACTIVA = [...ACTIVE_INVENTORY_ORDER_STATUSES];
  const ESTADOS_INCIDENCIA_ABIERTA = ['reportado'];

  /** `?, ?, ?` para un IN, con los valores aparte. */
  function marcadores(lista) {
    return lista.map(() => '?').join(', ');
  }

  let stats = {
    newCustomers: 0,
    inventory: 0,
    events: 0,
    openQuotes: 0,
    activeOrders: 0,
    openIncidents: 0
  };

  let upcomingEvents = [];
  let recentQuotes = [];
  let activeOrders = [];

  /** Sello de la consulta: se convierte en «hace N minutos». */
  let generadoEn = new Date().toISOString();
  let ahora = new Date();
  let reloj;

  $: metricas = [
    { key: 'newCustomers', label: 'Clientes nuevos', value: stats.newCustomers },
    { key: 'inventory', label: 'Artículos en inventario', value: stats.inventory, nota: 'al día de hoy' },
    { key: 'events', label: 'Eventos', value: stats.events },
    { key: 'openQuotes', label: 'Cotizaciones abiertas', value: stats.openQuotes },
    { key: 'activeOrders', label: 'Órdenes activas', value: stats.activeOrders },
    { key: 'openIncidents', label: 'Incidencias abiertas', value: stats.openIncidents }
  ];

  $: actualizado = formatRelativeTime(generadoEn, ahora);

  async function contar(sql, params = []) {
    const fila = await window.api.db.getOne(sql, params);
    return Number(fila?.n) || 0;
  }

  async function cargar() {
    if (!window.api?.db) return;

    const hoy = new Date();
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - (dias - 1));
    const from = fechaLocal(desde);
    const to = fechaLocal(hoy);
    const today = fechaLocal(hoy);

    try {
      /*
       * TODAS las cuentas filtran `is_active = 1`.
       *
       * La version anterior hacia `SELECT COUNT(*) FROM clients` a secas, sin
       * filtrar: los contadores incluian lo inactivo y lo archivado, asi que el
       * numero de la portada era mayor que el del listado que abre debajo.
       */
      stats = {
        newCustomers: await contar(
          "SELECT COUNT(*) AS n FROM clients WHERE is_active = 1 AND date(created_at) BETWEEN ? AND ?",
          [from, to]
        ),
        // El inventario es un STOCK —lo que hay AHORA—, no un flujo: no se
        // acota al periodo, y por eso lleva su propia nota bajo la cifra.
        inventory: await contar('SELECT COUNT(*) AS n FROM items WHERE is_active = 1'),
        events: await contar(
          "SELECT COUNT(*) AS n FROM events WHERE is_active = 1 AND date IS NOT NULL AND date <> '' AND date BETWEEN ? AND ?",
          [from, to]
        ),
        openQuotes: await contar(
          `SELECT COUNT(*) AS n FROM quotations
            WHERE is_active = 1 AND date(created_at) BETWEEN ? AND ?
              AND status IN (${marcadores(ESTADOS_COTIZACION_ABIERTA)})`,
          [from, to, ...ESTADOS_COTIZACION_ABIERTA]
        ),
        activeOrders: await contar(
          `SELECT COUNT(*) AS n FROM work_orders
            WHERE is_active = 1 AND date(created_at) BETWEEN ? AND ?
              AND status IN (${marcadores(ESTADOS_ORDEN_ACTIVA)})`,
          [from, to, ...ESTADOS_ORDEN_ACTIVA]
        ),
        openIncidents: await contar(
          `SELECT COUNT(*) AS n FROM incidents
            WHERE is_active = 1 AND date(created_at) BETWEEN ? AND ?
              AND status IN (${marcadores(ESTADOS_INCIDENCIA_ABIERTA)})`,
          [from, to, ...ESTADOS_INCIDENCIA_ABIERTA]
        )
      };

      // Los tres paneles son «los proximos/ultimos cinco», no cifras: no se
      // acotan al periodo elegido.
      upcomingEvents = await window.api.db.get(
        `SELECT e.id, e.name, e.date, e.event_type, c.name AS client_name
           FROM events e
           LEFT JOIN clients c ON c.id = e.client_id
          WHERE e.is_active = 1 AND e.date >= ?
          ORDER BY e.date ASC
          LIMIT 5`,
        [today]
      );

      recentQuotes = await window.api.db.get(
        `SELECT id, total, status FROM quotations
          WHERE is_active = 1
          ORDER BY id DESC
          LIMIT 5`
      );

      activeOrders = await window.api.db.get(
        `SELECT id, date, status FROM work_orders
          WHERE is_active = 1 AND status IN (${marcadores(ESTADOS_ORDEN_ACTIVA)})
          ORDER BY id DESC
          LIMIT 5`,
        ESTADOS_ORDEN_ACTIVA
      );

      generadoEn = new Date().toISOString();
      ahora = new Date();
    } catch (err) {
      console.error('No se pudo cargar la portada:', err);
    }
  }

  onMount(() => {
    cargar();
    // `generadoEn` es del momento de la consulta; el reloj lo refresca para que
    // «hace 4 minutos» siga siendo cierto sin recargar.
    reloj = setInterval(() => (ahora = new Date()), 60_000);
  });

  onDestroy(() => clearInterval(reloj));
</script>

<div class="dashboard">
  <header class="dashboard-cabecera">
    <p class="dashboard-sello">Actualizado {actualizado}</p>
    <label class="dashboard-periodo">
      <span class="sr-only">Periodo</span>
      <select bind:value={dias} on:change={cargar}>
        {#each PERIODOS as p (p)}
          <option value={p}>Últimos {p} días</option>
        {/each}
      </select>
    </label>
  </header>

  <!-- Franja unica partida por hairlines, no seis tarjetas: seis cifras de un
       digito no necesitan seis cajas con sombra compitiendo con el contenido. -->
  <section class="franja" aria-label="Métricas">
    {#each metricas as metrica (metrica.key)}
      <article class="metrica">
        <span class="metrica-label">{metrica.label}</span>
        <strong class="metrica-valor">{formatNumber(metrica.value)}</strong>
        {#if metrica.nota}
          <span class="metrica-nota">{metrica.nota}</span>
        {/if}
      </article>
    {/each}
  </section>

  <section class="paneles">
    <article class="panel-card">
      <div class="panel-card-header">
        <h2>Próximos eventos</h2>
        <a class="ver-todos" href="/events">Ver todos</a>
      </div>
      {#if upcomingEvents.length === 0}
        <EmptyState
          icon="calendar"
          title="Sin eventos programados"
          description="Agenda el primero para verlo aquí."
          actionLabel="Ir a Eventos"
          actionHref="/events"
        />
      {:else}
        <ul class="lineas">
          {#each upcomingEvents as evento (evento.id)}
            <li>
              <a href="/events">
                <span class="linea-principal">
                  <span class="linea-titulo">{evento.name}</span>
                  {#if evento.event_type}
                    <span class="linea-meta">{evento.event_type}</span>
                  {/if}
                </span>
                <span class="linea-meta">{formatDate(evento.date)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel-card">
      <div class="panel-card-header">
        <h2>Cotizaciones recientes</h2>
        <a class="ver-todos" href="/quotations">Ver todas</a>
      </div>
      {#if recentQuotes.length === 0}
        <EmptyState
          icon="document"
          title="Sin cotizaciones"
          description="Prepara una propuesta y aparecerá aquí."
          actionLabel="Ir a Cotizaciones"
          actionHref="/quotations"
        />
      {:else}
        <ul class="lineas">
          {#each recentQuotes as cotizacion (cotizacion.id)}
            <li>
              <a href="/quotations/edit?id={cotizacion.id}">
                <span class="linea-principal">
                  <span class="linea-titulo linea-mono">
                    #{String(cotizacion.id).padStart(5, '0')}
                  </span>
                  <span class="badge {statusBadgeClass(cotizacion.status)}">
                    {statusLabel(cotizacion.status)}
                  </span>
                </span>
                <span class="linea-importe">{formatMoney(cotizacion.total)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </section>

  <!-- El tercer panel va a ancho completo: en una rejilla de dos columnas se
       quedaria huerfano en la segunda fila. -->
  <section class="panel-ancho">
    <article class="panel-card">
      <div class="panel-card-header">
        <h2>Órdenes activas</h2>
        <a class="ver-todos" href="/work_orders">Ver todas</a>
      </div>
      {#if activeOrders.length === 0}
        <EmptyState
          icon="box"
          title="Sin órdenes en flujo"
          description="Convierte una cotización aprobada para empezar."
          actionLabel="Ir a Cotizaciones"
          actionHref="/quotations"
        />
      {:else}
        <ul class="lineas">
          {#each activeOrders as orden (orden.id)}
            <li>
              <a href="/work_orders/edit?id={orden.id}">
                <span class="linea-principal">
                  <span class="linea-titulo linea-mono">
                    WO-{String(orden.id).padStart(5, '0')}
                  </span>
                  <span class="badge {statusBadgeClass(orden.status)}">
                    {statusLabel(orden.status)}
                  </span>
                </span>
                <span class="linea-meta">{formatDate(orden.date)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </section>
</div>

<style>
  /* El vocabulario de esta pantalla —`.dashboard`, `.franja`, `.metrica*`,
     `.panel-card*`, `.lineas*`— vive en @esr/config/theme.css, compartido con
     ESR Cloud. Aquí solo queda lo local.

     OJO: un `<style>` de componente va SIN capa y gana siempre a la hoja
     compartida, así que redefinir algo aquí anula la homologación en silencio. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
