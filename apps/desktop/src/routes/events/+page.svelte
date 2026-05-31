<script>
  import { onMount } from 'svelte';
  import { validateEventInput } from '@esr/schemas';
  import { Modal } from '@esr/ui';

  let viewState = "1";
  let events = [];
  let clients = [];
  let quotations = [];
  let workOrders = [];
  let eventTypes = [];
  
  let showModal = false;
  let isEditing = false;
  
  let viewMode = 'list';
  let currentDate = new Date();
  $: currentMonth = currentDate.getMonth();
  $: currentYear = currentDate.getFullYear();
  
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  
  let calendarDays = [];
  $: generateCalendarDays(currentMonth, currentYear, events);
  
  function generateCalendarDays(month, year, evs) {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let days = [];
    
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, isCurrentMonth: false, dateString: null, events: [] });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const dayEvs = evs.filter(e => e.date === dString);
      days.push({ day: i, isCurrentMonth: true, dateString: dString, events: dayEvs });
    }
    
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        days.push({ day: i, isCurrentMonth: false, dateString: null, events: [] });
    }
    
    calendarDays = days;
  }
  
  function prevMonth() {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  }
  
  function nextMonth() {
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }
  
  let currentEvent = {
    id: null,
    client_id: '',
    name: '',
    event_type: '',
    date: new Date().toISOString().split('T')[0],
    departure_time: '',
    setup_time: '',
    pickup_date: '',
    pickup_time: '',
    location: '',
    responsible_person: '',
    notes: '',
    quotation_id: '',
    work_order_id: '',
    status: 'confirmado'
  };

  async function loadData() {
    if (window.api && window.api.db) {
      clients = await window.api.db.get("SELECT id, name FROM clients WHERE is_active = 1 ORDER BY name ASC");
      quotations = await window.api.db.get("SELECT id FROM quotations WHERE is_active = 1 AND status != 'borrador' ORDER BY id DESC");
      workOrders = await window.api.db.get("SELECT id FROM work_orders WHERE is_active = 1 ORDER BY id DESC");
      eventTypes = await window.api.db.get("SELECT id, name, color FROM event_types WHERE is_active = 1 ORDER BY name ASC");
      loadEvents();
    }
  }

  async function loadEvents() {
    let query = `
      SELECT e.*, c.name as client_name 
      FROM events e
      LEFT JOIN clients c ON e.client_id = c.id
      WHERE e.is_active = ?
      ORDER BY e.date DESC
    `;
    events = await window.api.db.get(query, [parseInt(viewState)]);
  }

  onMount(() => {
    loadData();
  });

  function openCreate() {
    isEditing = false;
    currentEvent = {
        id: null, client_id: '', name: '', event_type: eventTypes.length > 0 ? eventTypes[0].name : '', 
        date: new Date().toISOString().split('T')[0], departure_time: '', setup_time: '', 
        pickup_date: '', pickup_time: '', location: '', responsible_person: '', notes: '', 
        quotation_id: '', work_order_id: '', status: 'confirmado'
    };
    showModal = true;
  }

  function openEdit(ev) {
    isEditing = true;
    currentEvent = { ...ev };
    showModal = true;
  }

  async function saveEvent() {
    if (!validateEventInput(currentEvent).valid) {
      alert("El nombre del evento y el cliente son obligatorios.");
      return;
    }

    if (isEditing) {
      await window.api.db.run(`
        UPDATE events SET 
          client_id=?, name=?, event_type=?, date=?, departure_time=?, setup_time=?, pickup_date=?, pickup_time=?, location=?, responsible_person=?, notes=?, quotation_id=?, work_order_id=?, status=?
        WHERE id=?`, 
        [currentEvent.client_id, currentEvent.name, currentEvent.event_type, currentEvent.date, 
         currentEvent.departure_time, currentEvent.setup_time, currentEvent.pickup_date, currentEvent.pickup_time, 
         currentEvent.location, currentEvent.responsible_person, currentEvent.notes, currentEvent.quotation_id || null, currentEvent.work_order_id || null, currentEvent.status, currentEvent.id]
      );
    } else {
      await window.api.db.run(`
        INSERT INTO events (client_id, name, event_type, date, departure_time, setup_time, pickup_date, pickup_time, location, responsible_person, notes, quotation_id, work_order_id, status) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [currentEvent.client_id, currentEvent.name, currentEvent.event_type, currentEvent.date, 
         currentEvent.departure_time, currentEvent.setup_time, currentEvent.pickup_date, currentEvent.pickup_time, 
         currentEvent.location, currentEvent.responsible_person, currentEvent.notes, currentEvent.quotation_id || null, currentEvent.work_order_id || null, currentEvent.status]
      );
    }
    
    showModal = false;
    loadEvents();
  }

  async function changeStatus(id, newStatus) {
    await window.api.db.run("UPDATE events SET status = ? WHERE id = ?", [newStatus, id]);
    loadEvents();
  }

  async function changeState(id, newState) {
    let msg = newState === 0 ? "¿Archivar este evento?" 
            : newState === 1 ? "¿Marcar este evento como Activo?"
            : "¿Marcar este evento como Inactivo?";
    if (confirm(msg)) {
      try {
        await window.api.db.run("UPDATE events SET is_active = ? WHERE id = ?", [newState, id]);
        loadEvents();
      } catch (e) {
        if (e.message.includes("no such column")) {
          await window.api.db.run("ALTER TABLE events ADD COLUMN is_active INTEGER DEFAULT 1");
          await window.api.db.run("UPDATE events SET is_active = ? WHERE id = ?", [newState, id]);
          loadEvents();
        } else {
          console.error(e);
        }
      }
    }
  }

  function getEventTypeColor(typeName) {
    const et = eventTypes.find(t => t.name === typeName);
    return et?.color || '#6c757d';
  }

  function getStatusBadgeClass(status) {
    switch(status) {
      case 'confirmado': return 'badge-success';
      case 'tentativo': return 'badge-warning';
      case 'cancelado': return 'badge-danger';
      case 'completado': return 'badge-primary';
      default: return 'badge-secondary';
    }
  }
</script>

<div class="card">
  <div class="card-title" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
    <span>Agenda de Eventos</span>
    <div style="display: flex; gap: 10px; align-items: center;">
      <select bind:value={viewState} on:change={loadEvents} style="padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); font-size: 0.9em; height: 35px;">
        <option value="1">🟢 Activos</option>
        <option value="2">🟠 Inactivos</option>
        <option value="0">📁 Archivados</option>
      </select>
      <div class="btn-group" style="display: flex; background: var(--surface-color, #fff); border: 1px solid var(--border-color, #dee2e6); border-radius: var(--radius-sm, 4px); overflow: hidden; height: 35px;">
        <button class="btn-toggle {viewMode === 'list' ? 'active' : ''}" on:click={() => viewMode = 'list'}>Lista</button>
        <button class="btn-toggle {viewMode === 'calendar' ? 'active' : ''}" on:click={() => viewMode = 'calendar'}>Calendario</button>
      </div>
      <button class="btn btn-primary" style="height: 35px;" on:click={openCreate}>+ Crear Evento</button>
    </div>
  </div>

  {#if viewMode === 'list'}
  <div class="table-wrapper">
    <table class="table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Nombre del Evento</th>
          <th>Cliente</th>
          <th>Locación</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {#each events as ev}
          <tr>
            <td style="font-weight: 500; border-left: 3px solid {getEventTypeColor(ev.event_type)}; padding-left: 10px;">{ev.date}</td>
            <td>
              <span style="font-weight: 600;">{ev.name}</span><br>
              <small style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted);">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: {getEventTypeColor(ev.event_type)}; display: inline-block; flex-shrink: 0;"></span>
                {ev.event_type}
              </small>
            </td>
            <td>{ev.client_name}</td>
            <td>{ev.location || '-'}</td>
            <td>
              <span class="badge {getStatusBadgeClass(ev.status)}">{ev.status.toUpperCase()}</span>
            </td>
            <td>
              <button class="btn-icon" title="Editar" on:click={() => openEdit(ev)}>✏️</button>
              {#if ev.status !== 'completado' && viewState === '1'}
                <button class="btn-icon text-success" title="Marcar como Completado" on:click={() => changeStatus(ev.id, 'completado')}>✅</button>
              {/if}
              {#if viewState === '1'}
                <button class="btn-icon text-warning" title="Inactivar" on:click={() => changeState(ev.id, 2)}>⏸️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(ev.id, 0)}>📁</button>
              {:else if viewState === '2'}
                <button class="btn-icon text-success" title="Activar" on:click={() => changeState(ev.id, 1)}>▶️</button>
                <button class="btn-icon text-danger" title="Archivar" on:click={() => changeState(ev.id, 0)}>📁</button>
              {:else}
                <button class="btn-icon" title="Restaurar a Activo" on:click={() => changeState(ev.id, 1)}>🔄</button>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">No hay eventos registrados en la agenda.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
  {#if viewMode === 'calendar'}
    <div class="calendar-wrapper">
      <div class="calendar-header">
        <button class="btn btn-secondary" on:click={prevMonth}>&lt;</button>
        <h3>{monthNames[currentMonth]} {currentYear}</h3>
        <button class="btn btn-secondary" on:click={nextMonth}>&gt;</button>
      </div>
      <div class="calendar-grid">
        <div class="weekday">Dom</div>
        <div class="weekday">Lun</div>
        <div class="weekday">Mar</div>
        <div class="weekday">Mié</div>
        <div class="weekday">Jue</div>
        <div class="weekday">Vie</div>
        <div class="weekday">Sáb</div>
        
        {#each calendarDays as day}
          <div class="calendar-cell {day.isCurrentMonth ? '' : 'other-month'}" class:today={day.dateString === new Date().toISOString().split('T')[0]}>
            <div class="day-number">{day.day}</div>
            <div class="day-events">
              {#if day.isCurrentMonth}
                {#each day.events as ev}
                  {@const typeColor = getEventTypeColor(ev.event_type)}
                  <button
                    class="event-badge"
                    style="background: {typeColor}22; color: {typeColor}; border-left: 3px solid {typeColor};"
                    on:click|stopPropagation={() => openEdit(ev)}
                    type="button"
                  >
                    {ev.name}
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<Modal bind:show={showModal} title={isEditing ? 'Editar Evento' : 'Crear Nuevo Evento'} maxWidth="750px">
  <div style="display: flex; flex-direction: column; gap: 15px;">
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="ev-name">Nombre del Evento *</label>
        <input id="ev-name" type="text" bind:value={currentEvent.name} class="form-control" placeholder="Ej. Boda Rivas-Gomez">
      </div>
      <div style="flex: 1;">
        <label for="ev-type">Tipo de Evento</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <select id="ev-type" bind:value={currentEvent.event_type} class="form-control" style="flex: 1;">
            {#each eventTypes as et}
              <option value={et.name}>{et.name}</option>
            {/each}
            {#if eventTypes.length === 0}
              <option value="General">General</option>
            {/if}
          </select>
          <div style="width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0; border: 1px solid var(--border-color); background: {getEventTypeColor(currentEvent.event_type)};"></div>
        </div>
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="ev-client">Cliente Asignado *</label>
        <select id="ev-client" bind:value={currentEvent.client_id} class="form-control">
          <option value="">Seleccione Cliente...</option>
          {#each clients as client}
            <option value={client.id}>{client.name}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="ev-date">Fecha Principal</label>
        <input id="ev-date" type="date" bind:value={currentEvent.date} class="form-control">
      </div>
    </div>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 5px 0;">

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="ev-dep">Hora de Salida (Almacén)</label>
        <input id="ev-dep" type="time" bind:value={currentEvent.departure_time} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="ev-setup">Hora de Montaje</label>
        <input id="ev-setup" type="time" bind:value={currentEvent.setup_time} class="form-control">
      </div>
    </div>
    
    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="ev-pdate">Fecha de Recogida/Desmontaje</label>
        <input id="ev-pdate" type="date" bind:value={currentEvent.pickup_date} class="form-control">
      </div>
      <div style="flex: 1;">
        <label for="ev-ptime">Hora de Recogida</label>
        <input id="ev-ptime" type="time" bind:value={currentEvent.pickup_time} class="form-control">
      </div>
    </div>

    <div style="display: flex; gap: 15px;">
      <div style="flex: 2;">
        <label for="ev-loc">Lugar / Locación</label>
        <input id="ev-loc" type="text" bind:value={currentEvent.location} class="form-control" placeholder="Dirección exacta o venue">
      </div>
      <div style="flex: 1;">
        <label for="ev-resp">Responsable Comercial</label>
        <input id="ev-resp" type="text" bind:value={currentEvent.responsible_person} class="form-control">
      </div>
    </div>

    <hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 5px 0;">

    <div style="display: flex; gap: 15px;">
      <div style="flex: 1;">
        <label for="ev-qt">Vincular Cotización</label>
        <select id="ev-qt" bind:value={currentEvent.quotation_id} class="form-control">
          <option value="">(Ninguna)</option>
          {#each quotations as qt}
            <option value={qt.id}>Cotización #{String(qt.id).padStart(5,'0')}</option>
          {/each}
        </select>
      </div>
      <div style="flex: 1;">
        <label for="ev-wo">Vincular Orden de Trabajo</label>
        <select id="ev-wo" bind:value={currentEvent.work_order_id} class="form-control">
          <option value="">(Ninguna)</option>
          {#each workOrders as wo}
            <option value={wo.id}>WO-{String(wo.id).padStart(5,'0')}</option>
          {/each}
        </select>
      </div>
    </div>

    <div>
      <label for="ev-notes">Condiciones o Notas del Evento</label>
      <textarea id="ev-notes" bind:value={currentEvent.notes} class="form-control" rows="2"></textarea>
    </div>

    {#if isEditing}
    <div>
      <label for="ev-status">Estado del Evento</label>
      <select id="ev-status" bind:value={currentEvent.status} class="form-control">
        <option value="tentativo">Tentativo (Cotizando)</option>
        <option value="confirmado">Confirmado</option>
        <option value="completado">Completado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>
    {/if}

  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => showModal = false}>Cancelar</button>
    <button class="btn btn-primary" on:click={saveEvent}>Guardar Evento</button>
  </div>
</Modal>

<style>
  .btn-toggle { background: transparent; border: none; padding: 6px 12px; cursor: pointer; color: var(--text-muted); font-size: 0.9rem; font-weight: 500; }
  .btn-toggle.active { background: var(--primary); color: white; }
  
  .calendar-wrapper { padding: 20px 0; }
  .calendar-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
  .calendar-header h3 { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color); }
  
  .calendar-grid { 
    display: grid; 
    grid-template-columns: repeat(7, 1fr); 
    gap: 1px; 
    background: var(--border-color, #dee2e6);
    border: 1px solid var(--border-color, #dee2e6);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }
  .weekday { text-align: center; padding: 10px; font-weight: 600; color: var(--text-muted); background: var(--surface-color, #fff); font-size: 0.9rem; }
  .calendar-cell { 
    background: var(--surface-color, #fff); 
    min-height: 100px; 
    padding: 8px; 
    display: flex; 
    flex-direction: column; 
    transition: background-color 0.2s;
  }
  .calendar-cell.other-month { opacity: 0.4; background: var(--surface-secondary, #f9f9f9); }
  .calendar-cell.today { background: rgba(67, 94, 190, 0.05); }
  .calendar-cell:hover:not(.other-month) { background: rgba(0,0,0,0.02); }
  
  .day-number { font-weight: 600; font-size: 0.9rem; margin-bottom: 5px; color: var(--text-muted); }
  .today .day-number { color: var(--primary); background: rgba(67, 94, 190, 0.1); width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }
  
  .day-events { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; max-height: 80px; }
  .event-badge { 
    font-size: 0.7rem; 
    padding: 3px 6px; 
    border-radius: var(--radius-sm, 4px); 
    white-space: nowrap; 
    overflow: hidden; 
    text-overflow: ellipsis; 
    cursor: pointer;
    font-weight: 500;
    border: none;
    text-align: left;
    width: 100%;
    display: block;
  }
  .event-badge:hover { filter: brightness(0.95); }
  
  .bg-success { background-color: rgba(40, 167, 69, 0.15); color: #1e7e34; border-left: 3px solid #28a745; }
  .bg-warning { background-color: rgba(255, 193, 7, 0.15); color: #b38600; border-left: 3px solid #ffc107; }
  .bg-danger { background-color: rgba(220, 53, 69, 0.15); color: #bd2130; border-left: 3px solid #dc3545; }
  .bg-primary { background-color: rgba(67, 94, 190, 0.15); color: #2c3e50; border-left: 3px solid var(--primary); }
  .bg-secondary { background-color: rgba(108, 117, 125, 0.15); color: #495057; border-left: 3px solid #6c757d; }

  .form-control { width: 100%; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); outline: none; }
  .form-control:focus { border-color: var(--primary); }
  label { display: block; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-bottom: 5px; }
  .btn-icon { background: none; border: none; cursor: pointer; padding: 5px; opacity: 0.6; transition: 0.2s;}
  .btn-icon:hover { opacity: 1; transform: scale(1.1); }
  .text-danger { color: var(--danger); }
  .text-success { color: var(--success); }
  .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-primary { background-color: rgba(67, 94, 190, 0.1); color: var(--primary); }
  .badge-secondary { background-color: rgba(108, 117, 125, 0.1); color: var(--secondary); }
  .badge-warning { background-color: rgba(255, 193, 7, 0.1); color: #d39e00; }
  .badge-success { background-color: rgba(40, 167, 69, 0.1); color: var(--success); }
  .badge-danger { background-color: rgba(220, 53, 69, 0.1); color: var(--danger); }
</style>
