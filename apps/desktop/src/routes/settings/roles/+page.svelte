<script>
  import { Icon } from '@esr/ui';
  import {
    COMPANY_ROLES,
    PERMISSION_GROUPS,
    PERMISSION_LABELS,
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    ROLE_PERMISSIONS
  } from '@esr/core';

  /**
   * Configuración › Roles y permisos.
   *
   * Referencia de solo lectura, calcada de `(app)/settings/roles` en ESR
   * Cloud: aquí no hay servidor que arme la matriz en un `load`, así que se
   * calcula directo desde las mismas constantes de `@esr/core` que ya usa
   * `$lib/can.js` para filtrar el menú. No hay accion que guardar ni boton
   * de refrescar: no hay nada que releer de la base.
   */

  const roles = COMPANY_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    total: ROLE_PERMISSIONS[role].length
  }));

  const grupos = PERMISSION_GROUPS.map((grupo) => ({
    label: grupo.label,
    permisos: grupo.permissions.map((permission) => ({
      permission,
      label: PERMISSION_LABELS[permission],
      concedido: COMPANY_ROLES.map((role) => ROLE_PERMISSIONS[role].includes(permission))
    }))
  }));

  /** Lo que cada rol añade sobre el inmediatamente inferior. */
  const extras = COMPANY_ROLES.map((role, i) => {
    const anterior = COMPANY_ROLES[i + 1];
    const previos = anterior ? new Set(ROLE_PERMISSIONS[anterior]) : new Set();
    return {
      role,
      sobre: anterior ? ROLE_LABELS[anterior] : null,
      nuevos: ROLE_PERMISSIONS[role].filter((p) => !previos.has(p)).map((p) => PERMISSION_LABELS[p])
    };
  });
  const extrasPorRol = Object.fromEntries(extras.map((e) => [e.role, e]));
</script>

<div class="herramientas">
  <div class="grupo">
    <a class="grupo-btn" href="/settings" aria-label="Volver a Configuración" title="Volver a Configuración">
      <Icon name="back" size={18} />
    </a>
  </div>
</div>

<div class="record-header">
  <div class="record-titulo">
    <h1>Roles y permisos</h1>
  </div>
</div>

<section class="card">
  <p class="panel-hint">
    Los roles son fijos: se asignan en <a href="/settings/users">Usuarios del Sistema</a>, pero no se
    crean ni se editan. Cada rol incluye todo lo del anterior y añade lo suyo.
  </p>

  <div class="fichas">
    {#each roles as rol (rol.role)}
      {@const extra = extrasPorRol[rol.role]}
      <article class="ficha">
        <header class="ficha-cabecera">
          <h2>{rol.label}</h2>
          <span class="badge badge-muted">{rol.total} permisos</span>
        </header>
        <p class="ficha-desc">{rol.description}</p>

        {#if extra.nuevos.length === 0}
          <p class="ficha-nota">Mismos permisos que {extra.sobre}.</p>
        {:else}
          <p class="ficha-nota">
            {#if extra.sobre}Además de todo lo de {extra.sobre}, puede:{:else}Puede:{/if}
          </p>
          <ul class="ficha-lista">
            {#each extra.nuevos as permiso (permiso)}
              <li>{permiso}</li>
            {/each}
          </ul>
        {/if}
      </article>
    {/each}
  </div>
</section>

<section class="card">
  <h2 class="sec-title">Matriz completa</h2>
  <p class="panel-hint">
    Sale de la misma constante que filtra el menú de verdad, así que no puede desviarse de lo que hace
    la aplicación.
  </p>

  <div class="matriz-scroll">
    <table class="data-table data-table--acento matriz">
      <thead>
        <tr>
          <th class="col-permiso">Permiso</th>
          {#each roles as rol (rol.role)}
            <th class="col-rol">{rol.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each grupos as grupo (grupo.label)}
          <tr class="fila-grupo">
            <th colspan={roles.length + 1} scope="colgroup">{grupo.label}</th>
          </tr>
          {#each grupo.permisos as permiso (permiso.permission)}
            <tr>
              <td class="col-permiso">{permiso.label}</td>
              {#each permiso.concedido as concedido, i (roles[i].role)}
                <td class="col-rol">
                  <span
                    class="marca"
                    class:si={concedido}
                    title={`${roles[i].label}: ${concedido ? 'sí' : 'no'}`}
                  >
                    <span aria-hidden="true">{concedido ? '●' : '·'}</span>
                    <span class="visually-hidden">{concedido ? 'sí' : 'no'}</span>
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .record-header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-titulo {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .card + .card {
    margin-top: var(--sp-4);
  }

  .fichas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--sp-4);
  }

  .ficha {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--sp-4);
    background: var(--surface-sunken);
  }

  .ficha-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-2);
  }

  .ficha-cabecera h2 {
    margin: 0;
    font-size: var(--font-md);
  }

  .ficha-desc {
    margin: 0 0 var(--sp-3);
    font-size: var(--font-sm);
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .ficha-nota {
    margin: 0 0 var(--sp-2);
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .ficha-lista {
    margin: 0;
    padding-left: 1.1rem;
    font-size: var(--font-sm);
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .sec-title {
    margin: 0 0 var(--sp-2);
    font-size: var(--font-md);
  }

  .matriz-scroll {
    overflow-x: auto;
  }

  .matriz {
    min-width: 640px;
  }

  .col-permiso {
    text-align: left;
    white-space: nowrap;
  }

  .col-rol {
    text-align: center;
    width: 1%;
    white-space: nowrap;
  }

  .fila-grupo th {
    text-align: left;
    background: var(--surface-sunken);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }

  .marca {
    color: var(--text-placeholder);
    font-size: 1rem;
  }

  .marca.si {
    color: var(--success-text);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
