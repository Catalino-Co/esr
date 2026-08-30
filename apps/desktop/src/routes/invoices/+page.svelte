<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { fmt } from '@esr/reports';
  import { unwrapOr } from '$lib/ipc';

  let viewState = '1';
  let statusFilter = '';
  let search = '';
  let invoices = [];

  async function loadInvoices() {
    if (!window.api?.invoices) return;
    invoices = unwrapOr(
      await window.api.invoices.list({
        state: parseInt(viewState),
        status: statusFilter || undefined,
        search: search.trim() || undefined
      }),
      []
    );
  }

  onMount(() => loadInvoices());

  /**
   * Una factura anulada no tiene saldo: no se debe nada porque el documento ya
   * no existe a efectos de cobro. Devolver 0 lo pintaria como «saldada», que
   * diria que se cobro.
   */
  function saldo(inv) {
    if (inv.status === 'anulada') return null;
    const pendiente = Number(inv.total || 0) - Number(inv.paid || 0);
    return pendiente > 0 ? pendiente : 0;
  }

  function vencida(inv) {
    if (inv.status === 'anulada' || !inv.due_date) return false;
    return saldo(inv) > 0 && inv.due_date < new Date().toISOString().slice(0, 10);
  }

  async function changeState(id, newState) {
    const msg =
      newState === 0 ? '¿Archivar esta factura?'
      : newState === 1 ? '¿Restaurar esta factura?'
      : '¿Marcar la factura como inactiva?';
    if (!confirm(msg)) return;
    await window.api.invoices.setState(id, newState);
    loadInvoices();
  }
</script>

<div class="card">
  <div class="card-title" style="align-items:center;">
    <div style="display:flex;gap:15px;align-items:center;flex-wrap:wrap;">
      <span>Facturas</span>
      <select bind:value={viewState} on:change={loadInvoices}
        style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);font-size:.9em;">
        <option value="1">🟢 Activas</option>
        <option value="2">🟠 Inactivas</option>
        <option value="0">📁 Archivadas</option>
      </select>
      <select bind:value={statusFilter} on:change={loadInvoices}
        style="padding:4px 8px;border-radius:4px;border:1px solid var(--border-color);font-size:.9em;">
        <option value="">Cualquier estado</option>
        <option value="emitida">Emitidas</option>
        <option value="anulada">Anuladas</option>
      </select>
      <input placeholder="Número o cliente" bind:value={search} on:input={loadInvoices}
        style="padding:5px 10px;border-radius:4px;border:1px solid var(--border-color);font-size:.9em;" />
    </div>
    <button class="btn btn-primary" on:click={() => goto('/invoices/new')}>+ Nueva Factura</button>
  </div>

  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Factura #</th>
          <th>Cliente</th>
          <th>WO Referencia</th>
          <th>Fecha</th>
          <th>Vence</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:right;">Cobrado</th>
          <th style="text-align:right;">Saldo</th>
          <th>Estado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each invoices as inv}
          <tr>
            <td style="font-weight:600;color:var(--accent-active);">{inv.invoice_number}</td>
            <td style="font-weight:500;">{inv.client_name || '—'}</td>
            <td style="color:var(--text-muted);">
              {inv.work_order_id ? `WO-${String(inv.work_order_id).padStart(5, '0')}` : '—'}
            </td>
            <td>{inv.date || '—'}</td>
            <td class:vencida={vencida(inv)} style="color:var(--text-muted);">
              {inv.due_date || '—'}{#if vencida(inv)} ⚠{/if}
            </td>
            <td style="text-align:right;font-weight:700;">${fmt(inv.total)}</td>
            <td style="text-align:right;">${fmt(inv.paid)}</td>
            <td style="text-align:right;font-weight:600;">
              {#if saldo(inv) === null}
                <span style="color:var(--text-muted);">—</span>
              {:else if saldo(inv) === 0}
                <span class="text-success">Saldada</span>
              {:else}
                ${fmt(saldo(inv))}
              {/if}
            </td>
            <td>
              <span class="badge {inv.status === 'anulada' ? 'badge-secondary' : 'badge-primary'}">
                {inv.status.toUpperCase()}
              </span>
            </td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-icon" title="Ver factura"
                      on:click={() => goto(`/invoices/detail?id=${inv.id}`)}>🔎</button>
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar"
                        on:click={() => changeState(inv.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar"
                        on:click={() => changeState(inv.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon text-success" title="Restaurar"
                        on:click={() => changeState(inv.id, 1)}>↩️</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="10" style="text-align:center;padding:30px;color:var(--text-muted);">
              No hay facturas con este filtro.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  /* `--accent-active`, no `--primary`: en oscuro el acento como LETRA da 3.08:1
     sobre la tarjeta y no pasa AA. El activo da 7.34:1 en oscuro y 9.93:1 en
     claro. Desktop tiene el mismo fallo en otras pantallas; queda anotado. */

  /* Se marca la FECHA, no la fila entera.
     Tintar la fila de rojo bajaba el gris de `--text-muted` a 4.35:1 sobre ese
     fondo —pasa de sobra sobre la tarjeta, 4.76:1— y ademas se hacia raro leer
     el resto de la fila. Marcar la celda que de verdad esta vencida es mas
     preciso y `--danger-text` da 6.47:1 en claro y 5.29:1 en oscuro. */
  .vencida {
    color: var(--danger-text) !important;
    font-weight: 700;
  }
</style>
