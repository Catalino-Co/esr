<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { Modal } from '@esr/ui';
  import { validateCustomerInput } from '@esr/schemas';
  import {
    DOCUMENT_TYPES,
    DOCUMENT_TYPE_LABELS,
    PAYMENT_TERMS,
    PAYMENT_TERMS_LABELS,
    RECORD_STATES,
    RECORD_STATE_LABELS,
    recordStateBadgeClass,
    recordStateLabel
  } from '@esr/core';

  /**
   * Ficha del cliente. Sustituye al modal de 500 px del listado, y sigue el
   * mismo patron que cotizaciones, ordenes, conduces y paquetes.
   *
   * Dos tarjetas: el formulario del cliente a la izquierda y el directorio de
   * direcciones de SERVICIO a la derecha. No confundir esas direcciones con
   * `clients.address`, que es la FISCAL y sale en los documentos.
   *
   * El vocabulario (`.form-grid`, `.form-field`, `.form-actions`,
   * `.sunken-card`, `.btn-edit`…) sale de @esr/config/theme.css, el mismo que
   * usa Cloud. Aqui solo quedan las reglas que son propias de esta pantalla.
   */

  const VACIO = {
    id: null,
    name: '',
    document_id: '',
    document_type: '',
    payment_terms: '',
    sector_id: '',
    phone: '',
    email: '',
    address: '',
    contact_person: '',
    notes: '',
    is_active: 1
  };

  let client = { ...VACIO };
  let sectors = [];
  let addressTypes = [];
  let addresses = [];
  let isSaving = false;
  let mensaje = '';
  let error = '';

  /**
   * El id se lee de forma REACTIVA, no en `onMount`.
   *
   * SvelteKit reutiliza el componente cuando solo cambia la query, asi que
   * `onMount` no se vuelve a ejecutar: editar otro cliente desde el listado
   * dejaria la pantalla mostrando el anterior. El guarda `cargadoId` evita
   * recargar en bucle, porque el bloque reactivo se dispara con cualquier
   * cambio del store `page`.
   */
  $: clientId = $page.url.searchParams.get('id');
  let cargadoId;
  $: if (clientId !== cargadoId) {
    cargadoId = clientId;
    cargar(clientId);
  }

  $: isEditing = !!client.id;

  async function cargar(id) {
    if (!window.api?.db) return;
    mensaje = '';
    error = '';

    try {
      [sectors, addressTypes] = await Promise.all([
        window.api.db.get('SELECT id, name FROM commercial_sectors WHERE is_active IN (1, 2) ORDER BY name'),
        window.api.db.get('SELECT id, name FROM client_address_types WHERE is_active = 1 ORDER BY name')
      ]);

      if (!id) {
        client = { ...VACIO };
        addresses = [];
        return;
      }

      const fila = await window.api.db.getOne('SELECT * FROM clients WHERE id = ?', [id]);
      if (!fila) {
        error = 'El cliente no existe.';
        return;
      }
      // Los campos nuevos pueden venir NULL: el `<select>` necesita cadena.
      client = {
        ...fila,
        document_type: fila.document_type || '',
        payment_terms: fila.payment_terms || '',
        sector_id: fila.sector_id ?? ''
      };
      await cargarDirecciones(id);
    } catch (e) {
      error = 'No se pudieron cargar los datos. ' + (e?.message ?? '');
    }
  }

  async function cargarDirecciones(id) {
    // `COALESCE` resuelve la herencia al LEER: en la tabla, NULL significa
    // «hereda del cliente». Guardar una copia dejaria la direccion congelada
    // cuando cambie el dato del cliente.
    addresses = await window.api.db.get(
      `SELECT a.*,
              t.name AS address_type_name,
              COALESCE(a.contact_person, c.contact_person) AS effective_contact_person,
              COALESCE(a.phone, c.phone)                   AS effective_phone,
              COALESCE(a.email, c.email)                   AS effective_email
         FROM client_addresses a
         JOIN clients c ON c.id = a.client_id
         LEFT JOIN client_address_types t ON t.id = a.address_type_id
        WHERE a.client_id = ? AND a.is_active IN (1, 2)
        ORDER BY a.is_primary DESC, a.label ASC`,
      [id]
    );
  }

  async function guardar() {
    if (!validateCustomerInput(client).valid) {
      error = 'El nombre es obligatorio.';
      return;
    }
    isSaving = true;
    mensaje = '';
    error = '';
    try {
      const valores = [
        client.name.trim(),
        client.document_id || null,
        client.document_type || null,
        client.payment_terms || null,
        client.sector_id || null,
        client.phone || null,
        client.email || null,
        client.address || null,
        client.contact_person || null,
        client.notes || null,
        Number(client.is_active)
      ];

      if (isEditing) {
        await window.api.db.run(
          `UPDATE clients SET
             name = ?, document_id = ?, document_type = ?, payment_terms = ?, sector_id = ?,
             phone = ?, email = ?, address = ?, contact_person = ?, notes = ?, is_active = ?
           WHERE id = ?`,
          [...valores, client.id]
        );
        mensaje = 'Cambios guardados.';
      } else {
        const res = await window.api.db.run(
          `INSERT INTO clients
             (name, document_id, document_type, payment_terms, sector_id,
              phone, email, address, contact_person, notes, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          valores
        );
        // Se queda en la ficha en vez de volver al listado: la tarjeta de
        // direcciones pasa de deshabilitada a operativa sin cambiar de
        // pantalla. `cargadoId` se sincroniza a mano para que el bloque
        // reactivo no vuelva a cargar lo que ya tenemos.
        client = { ...client, id: res.id };
        cargadoId = String(res.id);
        addresses = [];
        mensaje = 'Cliente creado. Ya puedes agregar sus direcciones.';
        goto(`/clients/edit?id=${res.id}`, { replaceState: true, noScroll: true });
      }
    } catch (e) {
      // `db:run` RECHAZA la promesa cuando el SQL falla; sin este catch el
      // fallo no llega a ninguna parte y el usuario no ve nada.
      error = 'No se pudo guardar. ' + (e?.message ?? '');
    } finally {
      isSaving = false;
    }
  }

  // ── Direcciones ─────────────────────────────────────────────────────────
  const HEREDABLES = ['contact_person', 'phone', 'email'];
  const DIRECCION_VACIA = {
    id: null,
    label: '',
    address_type_id: '',
    address: '',
    contact_person: '',
    phone: '',
    email: '',
    mobile: '',
    notes: '',
    is_primary: 0
  };

  let showModal = false;
  let current = { ...DIRECCION_VACIA };
  let hereda = { contact_person: true, phone: true, email: true };
  let errorModal = '';

  function abrirAlta() {
    current = { ...DIRECCION_VACIA };
    hereda = { contact_person: true, phone: true, email: true };
    errorModal = '';
    showModal = true;
  }

  function abrirEdicion(entrada) {
    current = {
      ...entrada,
      address_type_id: entrada.address_type_id ?? '',
      contact_person: entrada.contact_person ?? '',
      phone: entrada.phone ?? '',
      email: entrada.email ?? '',
      mobile: entrada.mobile ?? '',
      notes: entrada.notes ?? ''
    };
    // NULL en la columna ES la herencia: la casilla lo refleja, no lo decide.
    hereda = Object.fromEntries(HEREDABLES.map((c) => [c, entrada[c] == null]));
    errorModal = '';
    showModal = true;
  }

  /** El valor a guardar: `null` si hereda, o lo tecleado. */
  function heredable(campo) {
    if (hereda[campo]) return null;
    const v = (current[campo] || '').trim();
    // Nunca cadena vacia: se perderia la diferencia entre «heredo» y «no tiene».
    return v || null;
  }

  async function guardarDireccion() {
    if (!current.label.trim()) { errorModal = 'El detalle es obligatorio.'; return; }
    if (!current.address.trim()) { errorModal = 'La dirección es obligatoria.'; return; }

    const valores = [
      current.label.trim(),
      current.address_type_id || null,
      current.address.trim(),
      heredable('contact_person'),
      heredable('phone'),
      heredable('email'),
      (current.mobile || '').trim() || null,
      (current.notes || '').trim() || null
    ];

    try {
      let id = current.id;
      if (id) {
        await window.api.db.run(
          `UPDATE client_addresses SET
             label = ?, address_type_id = ?, address = ?,
             contact_person = ?, phone = ?, email = ?, mobile = ?, notes = ?,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [...valores, id]
        );
      } else {
        const res = await window.api.db.run(
          `INSERT INTO client_addresses
             (client_id, label, address_type_id, address,
              contact_person, phone, email, mobile, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [client.id, ...valores]
        );
        id = res.id;
      }

      if (Number(current.is_primary) === 1) await marcarPrincipal(id, false);

      showModal = false;
      await cargarDirecciones(client.id);
    } catch (e) {
      // El indice unico parcial sobre el detalle es la barrera real.
      errorModal = String(e?.message ?? '').includes('UNIQUE')
        ? `Ya existe una dirección llamada «${current.label.trim()}» para este cliente.`
        : 'No se pudo guardar la dirección. ' + (e?.message ?? '');
    }
  }

  /**
   * UNA sola sentencia, y por eso atomica: apaga las demas y enciende esta a la
   * vez. El renderer no puede abrir transacciones —cada `db.run` es una
   * invocacion independiente— asi que hacerlo en dos pasos dejaria un instante
   * con cero principales, o con dos.
   */
  async function marcarPrincipal(id, recargar = true) {
    try {
      await window.api.db.run(
        'UPDATE client_addresses SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE client_id = ?',
        [id, client.id]
      );
      if (recargar) await cargarDirecciones(client.id);
    } catch (e) {
      error = 'No se pudo marcar la dirección principal. ' + (e?.message ?? '');
    }
  }

  async function cambiarEstadoDireccion(id, estado) {
    const msg =
      estado === 0
        ? '¿Archivar esta dirección?'
        : estado === 1
          ? '¿Reactivar esta dirección?'
          : '¿Marcar esta dirección como inactiva?';
    if (!confirm(msg)) return;
    try {
      // Una direccion que sale de circulacion no puede seguir siendo la principal.
      await window.api.db.run(
        `UPDATE client_addresses
            SET is_active = ?,
                is_primary = CASE WHEN ? = 1 THEN is_primary ELSE 0 END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [estado, estado, id]
      );
      await cargarDirecciones(client.id);
    } catch (e) {
      error = 'No se pudo cambiar el estado de la dirección. ' + (e?.message ?? '');
    }
  }

  function transiciones(estado) {
    if (estado === 1) return [{ to: 2, label: 'Desactivar' }, { to: 0, label: 'Archivar' }];
    if (estado === 2) return [{ to: 1, label: 'Reactivar' }, { to: 0, label: 'Archivar' }];
    return [{ to: 1, label: 'Reactivar' }];
  }
</script>

<div class="record-header">
  <h1>{isEditing ? client.name || 'Cliente' : 'Nuevo cliente'}</h1>
  {#if isEditing}
    <span class="badge {recordStateBadgeClass(client.is_active)}">
      {recordStateLabel(client.is_active)}
    </span>
  {/if}
</div>

<div class="client-layout">
  <div class="card">
    {#if mensaje}<div class="alert alert-success">{mensaje}</div>{/if}
    {#if error}<div class="alert alert-danger">{error}</div>{/if}

    <fieldset class="form-section">
      <legend>Identificación</legend>
      <div class="form-grid">
        <div class="form-field full">
          <label for="cli-name">Nombre o razón social *</label>
          <input id="cli-name" type="text" bind:value={client.name} placeholder="Ej. Eventos SRL" />
        </div>

        <!-- Tipo y numero van en el MISMO campo: separarlos deja que el reflow
             los ponga en filas distintas, y por separado no significan nada. -->
        <div class="form-field full">
          <label for="cli-doc">Documento</label>
          <div class="doc-pair">
            <select bind:value={client.document_type} aria-label="Tipo de documento">
              <!-- «Sin especificar» es el valor de los clientes que ya
                   existian. Preseleccionar RNC haria que abrir una ficha vieja
                   y pulsar «Guardar» escribiera un dato fiscal que nadie
                   afirmo. -->
              <option value="">— Tipo —</option>
              {#each DOCUMENT_TYPES as tipo}
                <option value={tipo}>{DOCUMENT_TYPE_LABELS[tipo]}</option>
              {/each}
            </select>
            <input id="cli-doc" type="text" bind:value={client.document_id} />
          </div>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Contacto</legend>
      <div class="form-grid">
        <div class="form-field">
          <label for="cli-contact">Persona de contacto</label>
          <input id="cli-contact" type="text" bind:value={client.contact_person} />
        </div>
        <div class="form-field">
          <label for="cli-phone">Teléfono</label>
          <input id="cli-phone" type="text" bind:value={client.phone} />
        </div>
        <div class="form-field full">
          <label for="cli-email">Email</label>
          <input id="cli-email" type="email" bind:value={client.email} />
        </div>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Comercial</legend>
      <div class="form-grid">
        <div class="form-field">
          <label for="cli-terms">Condición de pago</label>
          <select id="cli-terms" bind:value={client.payment_terms}>
            <option value="">— Sin especificar —</option>
            {#each PAYMENT_TERMS as termino}
              <option value={termino}>{PAYMENT_TERMS_LABELS[termino]}</option>
            {/each}
          </select>
        </div>
        <div class="form-field">
          <label for="cli-sector">Sector comercial</label>
          <select id="cli-sector" bind:value={client.sector_id}>
            <option value="">— Sin sector —</option>
            {#each sectors as sector}
              <option value={sector.id}>{sector.name}</option>
            {/each}
          </select>
          {#if sectors.length === 0}
            <span class="field-hint">
              No hay sectores. Se agregan en <a href="/settings/sectors">Ajustes</a>.
            </span>
          {/if}
        </div>
        <div class="form-field">
          <label for="cli-state">Estado</label>
          <select id="cli-state" bind:value={client.is_active}>
            {#each RECORD_STATES as opcion}
              <option value={opcion}>{RECORD_STATE_LABELS[opcion]}</option>
            {/each}
          </select>
        </div>
      </div>
    </fieldset>

    <fieldset class="form-section">
      <legend>Fiscal y notas</legend>
      <div class="form-grid">
        <div class="form-field full">
          <label for="cli-addr">Dirección fiscal</label>
          <input id="cli-addr" type="text" bind:value={client.address} />
          <span class="field-hint">
            La que aparece en los documentos. Las direcciones de servicio van aparte.
          </span>
        </div>
        <div class="form-field full">
          <label for="cli-notes">Notas</label>
          <textarea id="cli-notes" bind:value={client.notes} rows="3"></textarea>
        </div>
      </div>
    </fieldset>

    <div class="form-actions">
      <!-- «Volver al listado» al pie y a la izquierda. El `margin-right: auto`
           es local: `.form-actions` es compartida y sigue alineando a la
           derecha en todas las demas pantallas. -->
      <a href="/clients" class="btn btn-secondary back-link">Volver al listado</a>
      <button class="btn btn-primary" on:click={guardar} disabled={isSaving}>
        {isSaving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear cliente'}
      </button>
    </div>
  </div>

  <div class="card">
    <div class="book-header">
      <div>
        <div class="card-title">Direcciones de servicio</div>
        <p class="panel-hint">
          Dónde se entrega o se monta. Su tipo se configura en
          <a href="/settings/address-types">Tipos de Dirección</a>.
        </p>
      </div>
      {#if isEditing}
        <button class="btn btn-primary btn-new btn-sm" on:click={abrirAlta}>Agregar dirección</button>
      {/if}
    </div>

    {#if !isEditing}
      <p class="empty-state">Guarda el cliente para agregar sus direcciones de servicio.</p>
    {:else if addresses.length === 0}
      <p class="empty-state">Este cliente todavía no tiene direcciones de servicio.</p>
    {:else}
      <ul class="directory">
        {#each addresses as entrada (entrada.id)}
          <li class="sunken-card">
            <div class="entry-top">
              <strong>{entrada.label}</strong>
              {#if entrada.address_type_name}<span class="chip">{entrada.address_type_name}</span>{/if}
              {#if entrada.is_primary}<span class="chip chip-primary">★ Principal</span>{/if}
              {#if entrada.is_active !== 1}
                <span class="badge {recordStateBadgeClass(entrada.is_active)}">
                  {recordStateLabel(entrada.is_active)}
                </span>
              {/if}
            </div>

            <p class="entry-address">{entrada.address}</p>

            <dl class="entry-contact">
              <div>
                <dt>Contacto</dt>
                <dd>{entrada.effective_contact_person || '—'}{#if entrada.contact_person == null && entrada.effective_contact_person}<span class="inherited"> · heredado</span>{/if}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{entrada.effective_phone || '—'}{#if entrada.phone == null && entrada.effective_phone}<span class="inherited"> · heredado</span>{/if}</dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>{entrada.mobile || '—'}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{entrada.effective_email || '—'}{#if entrada.email == null && entrada.effective_email}<span class="inherited"> · heredado</span>{/if}</dd>
              </div>
            </dl>

            <div class="entry-actions">
              <button class="btn-edit" on:click={() => abrirEdicion(entrada)}>Editar</button>

              {#if entrada.is_active === 1 && !entrada.is_primary}
                <button class="btn btn-secondary btn-sm" on:click={() => marcarPrincipal(entrada.id)}>
                  ★ Principal
                </button>
              {/if}

              {#each transiciones(entrada.is_active) as paso (paso.to)}
                <button
                  class="btn {paso.to === 0 ? 'btn-danger' : 'btn-secondary'} btn-sm"
                  on:click={() => cambiarEstadoDireccion(entrada.id, paso.to)}
                >
                  {paso.label}
                </button>
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<Modal bind:show={showModal} title={current.id ? 'Editar dirección' : 'Nueva dirección'} maxWidth="560px">
  {#if errorModal}<div class="alert alert-danger">{errorModal}</div>{/if}

  <div class="form-grid">
    <div class="form-field">
      <label for="a-label">Detalle *</label>
      <input id="a-label" type="text" bind:value={current.label} placeholder="Sucursal Herrera, Plaza Internacional…" />
    </div>
    <div class="form-field">
      <label for="a-type">Tipo</label>
      <select id="a-type" bind:value={current.address_type_id}>
        <option value="">— Sin tipo —</option>
        {#each addressTypes as tipo}
          <option value={tipo.id}>{tipo.name}</option>
        {/each}
      </select>
    </div>

    <div class="form-field full">
      <label for="a-address">Dirección *</label>
      <input id="a-address" type="text" bind:value={current.address} />
    </div>

    {#each [{ campo: 'contact_person', etiqueta: 'Persona de contacto', fuente: client.contact_person }, { campo: 'phone', etiqueta: 'Teléfono', fuente: client.phone }, { campo: 'email', etiqueta: 'Email', fuente: client.email }] as fila (fila.campo)}
      <div class="form-field">
        <label for={`a-${fila.campo}`}>{fila.etiqueta}</label>
        <input
          id={`a-${fila.campo}`}
          type="text"
          value={hereda[fila.campo] ? (fila.fuente || '') : (current[fila.campo] || '')}
          readonly={hereda[fila.campo]}
          class:is-inherited={hereda[fila.campo]}
          on:input={(e) => (current[fila.campo] = e.currentTarget.value)}
        />
        <!-- La casilla decide, y el input NO va `disabled`. Deshabilitar
             funcionaria por accidente —un input deshabilitado no se envia— y se
             rompe en silencio el dia que alguien lo cambie a `readonly` para
             poder copiar el texto. -->
        <label class="inherit-check">
          <input type="checkbox" bind:checked={hereda[fila.campo]} /> Usar el del cliente
        </label>
      </div>
    {/each}

    <div class="form-field">
      <label for="a-mobile">Celular</label>
      <!-- No hereda: el cliente no tiene celular. -->
      <input id="a-mobile" type="text" bind:value={current.mobile} />
    </div>

    <div class="form-field full">
      <label for="a-notes">Notas de acceso</label>
      <textarea id="a-notes" bind:value={current.notes} rows="2" placeholder="Portón, horario de descarga, a quién llamar al llegar…"></textarea>
    </div>

    <div class="form-field full">
      <label class="inherit-check">
        <input
          type="checkbox"
          checked={Number(current.is_primary) === 1}
          on:change={(e) => (current.is_primary = e.currentTarget.checked ? 1 : 0)}
        />
        Marcar como dirección principal
      </label>
    </div>
  </div>

  <div slot="footer">
    <button class="btn btn-secondary" on:click={() => (showModal = false)}>Cancelar</button>
    <button class="btn btn-primary" on:click={guardarDireccion}>Guardar dirección</button>
  </div>
</Modal>

<style>
  /* Cabecera propia y no `.page-header`: el titulo de la PANTALLA vive en el
     topbar; este es el nombre del REGISTRO. Cloud hace lo mismo y por el mismo
     motivo. */
  .record-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-5);
  }

  .record-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .client-layout {
    display: grid;
    /* `minmax(0, 1fr)` y no `1fr`: el minimo de `1fr` es `auto`, y un input
       dentro reventaria la columna. */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--sp-4);
    /* `start` y no `stretch`: con dos direcciones, estirar la tarjeta derecha
       a la altura del formulario deja un socavon vacio. */
    align-items: start;
  }

  @media (max-width: 1100px) {
    .client-layout { grid-template-columns: 1fr; }
  }

  /* `.form-section`, su `legend` y su ajuste del `.form-grid` viven en
     @esr/config/theme.css: los usan las fichas de cliente de las dos apps. */

  .doc-pair { display: flex; gap: var(--sp-2); }
  .doc-pair select { flex: 0 0 8.5rem; }
  .doc-pair input { flex: 1 1 auto; min-width: 0; }

  .field-hint {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .back-link { margin-right: auto; }

  .book-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }

  .book-header .panel-hint { margin: 0; }

  .directory {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .entry-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: 4px;
  }

  .chip {
    padding: 1px var(--sp-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: var(--font-xs);
    /* --text-secondary y NO --text-muted: sobre el fondo hundido de
       `.sunken-card` el muted cae a 4.34:1, por debajo de AA. */
    color: var(--text-secondary);
  }

  .chip-primary {
    border-color: var(--accent-active);
    color: var(--accent-active);
  }

  .entry-address {
    margin: 0 0 var(--sp-2);
    font-size: var(--font-sm);
    color: var(--text-secondary);
  }

  .entry-contact {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--sp-2) var(--sp-3);
    margin: 0 0 var(--sp-3);
  }

  .entry-contact div { min-width: 0; }

  .entry-contact dt {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .entry-contact dd {
    margin: 0;
    font-size: var(--font-sm);
    overflow-wrap: anywhere;
  }

  .inherited {
    font-size: var(--font-xs);
    color: var(--text-secondary);
  }

  .entry-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .inherit-check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: var(--font-xs);
    font-weight: 400;
    color: var(--text-secondary);
  }

  .inherit-check input { width: auto; }

  .is-inherited { color: var(--text-secondary); }
</style>
