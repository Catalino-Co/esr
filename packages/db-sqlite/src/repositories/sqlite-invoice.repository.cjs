const {
  getQuery,
  getSingleQuery,
  runQuery,
  withTransaction
} = require('../connection.cjs');
const {
  calculateQuoteTotals,
  invoiceDraftErrorMessage,
  validateInvoiceDraft,
  validateInvoiceCanEdit,
  validateInvoiceCanFinalize,
  validateInvoiceSourceUnchanged,
  validateQuoteCanInvoiceDirectly
} = require('@esr/core');

/**
 * Facturas.
 *
 * La factura es el documento que se cobra. Cubre UNA O VARIAS entregas de la
 * misma orden —de ahi `invoice_conduces`— y sus lineas se COPIAN del conduce,
 * no se leen por join: una factura emitida no puede cambiar porque alguien
 * corrija el conduce despues.
 *
 * CONVENCION: un metodo con prefijo `tx` ASUME que ya hay una transaccion
 * abierta y no hace BEGIN ni COMMIT. Los publicos abren la suya con
 * `withTransaction`. Romper esto produce «cannot start a transaction within a
 * transaction» y un ROLLBACK que se lleva por delante el trabajo de quien
 * llamaba.
 *
 * NOTA sobre el resto de Desktop: casi todas las pantallas hacen su SQL a mano
 * desde el `.svelte` via `window.api.db.*`. Este modulo NO lo hace, porque
 * emitir o anular una factura con sus cobros exige atomicidad y ese camino no
 * tiene transacciones. Si copia usted un patron de aqui, copie este.
 */

/** Dos decimales. `REAL` + sumas deja restos como 0.30000000000000004. */
function round2(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100;
}

/**
 * Que conduces se pueden facturar.
 *
 * En Desktop TODOS los conduces son entregas: las devoluciones no emiten
 * documento, se registran por el estado de la orden y el checklist de retorno.
 * Si algun dia una devolucion generase conduce, ESTE es el unico sitio a tocar.
 */
const BILLABLE_CONDUCE_SQL = `
  co.is_active = 1
  AND co.status <> 'anulado'
  AND NOT EXISTS (
    SELECT 1 FROM invoice_conduces ic
    WHERE ic.conduce_id = co.id AND ic.is_active = 1
  )
`;

/**
 * Lineas de Servicio que todavia no cubre ninguna factura viva.
 *
 * Un Servicio no es tangible: nunca genera un conduce, asi que no puede
 * facturarse por el camino de arriba. Este es su espejo, sobre
 * `invoice_work_order_items` en vez de `invoice_conduces` -mismo mecanismo de
 * "un enlace activo a la vez", para que anular la factura libere la linea y se
 * pueda volver a facturar-.
 */
const SERVICE_NOT_BILLED = `
  NOT EXISTS (
    SELECT 1 FROM invoice_work_order_items iwi
    WHERE iwi.work_order_item_id = woi.id AND iwi.is_active = 1
  )
`;

/** Cuanto de una linea de cotizacion cubre ya alguna factura viva. */
const QUOTE_LINE_BILLED_QTY = `COALESCE((
  SELECT SUM(iqi.quantity) FROM invoice_quotation_items iqi
  WHERE iqi.quotation_item_id = qi.id AND iqi.is_active = 1
), 0)`;

/**
 * Lo que queda por facturar de una linea de cotizacion.
 *
 * A diferencia de `SERVICE_NOT_BILLED` -un si/no-, una cotizacion se factura
 * POR PARTES: lo que importa es la cantidad que sobra, no si alguna vez se
 * facturo algo de esa linea.
 */
const QUOTE_LINE_REMAINING = `(qi.quantity - ${QUOTE_LINE_BILLED_QTY})`;
const QUOTE_LINE_NOT_BILLED = `${QUOTE_LINE_REMAINING} > 0`;

const INVOICE_COLUMNS = `
  inv.*,
  c.name AS client_name,
  wo.id  AS order_ref,
  q.quote_number
`;

const INVOICE_JOINS = `
  FROM invoices inv
  LEFT JOIN clients c      ON c.id = inv.client_id
  LEFT JOIN work_orders wo ON wo.id = inv.work_order_id
  LEFT JOIN quotations q   ON q.id = inv.quotation_id
`;

class SqliteInvoiceRepository {
  // ── Lectura ─────────────────────────────────────────────────────────────

  async list(filters = {}) {
    const params = [];
    const where = [];

    const state = filters.state === undefined ? 1 : Number(filters.state);
    where.push('inv.is_active = ?');
    params.push(state);

    if (filters.status) {
      where.push('inv.status = ?');
      params.push(filters.status);
    }
    if (filters.client_id) {
      where.push('inv.client_id = ?');
      params.push(filters.client_id);
    }
    if (filters.work_order_id) {
      where.push('inv.work_order_id = ?');
      params.push(filters.work_order_id);
    }
    if (filters.quotation_id) {
      where.push('inv.quotation_id = ?');
      params.push(filters.quotation_id);
    }
    if (filters.search) {
      where.push('(inv.invoice_number LIKE ? OR c.name LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    // `inv.date` es TEXT `YYYY-MM-DD`: comparar cadenas coincide con comparar
    // fechas. Una factura sin fecha no desaparece nunca, igual que en
    // Ordenes/Cotizaciones: esconderla dejaria invisible una a la que se le
    // olvido la fecha.
    if (filters.date_from) {
      where.push('(inv.date IS NULL OR inv.date >= ?)');
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      where.push('(inv.date IS NULL OR inv.date <= ?)');
      params.push(filters.date_to);
    }

    // El cobrado sale por subconsulta correlacionada: una sola ida a la base en
    // vez de N consultas dentro del bucle de la pantalla.
    return await getQuery(
      `SELECT ${INVOICE_COLUMNS},
        COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.invoice_id = inv.id AND p.status = 'pagado'
        ), 0) AS paid
       ${INVOICE_JOINS}
       WHERE ${where.join(' AND ')}
       ORDER BY inv.id DESC`,
      params
    );
  }

  /**
   * Buscar por numero de factura, sin ventana de fechas ni `is_active`: si se
   * busca por numero es porque se sabe cual es, y una anulada tiene que
   * aparecer. `invoice_number` es NOT NULL en SQLite igual que en Postgres.
   */
  async searchByNumber(termino, limite = 10) {
    const t = String(termino || '').trim();
    if (!t) return [];
    const tope = Math.min(50, Math.max(1, Number(limite) || 10));
    return await getQuery(
      `SELECT ${INVOICE_COLUMNS}
       ${INVOICE_JOINS}
       WHERE inv.invoice_number LIKE '%' || ? || '%'
       ORDER BY
         (LOWER(inv.invoice_number) = LOWER(?)) DESC,
         (inv.invoice_number LIKE ? || '%') DESC,
         inv.date DESC, inv.id DESC
       LIMIT ?`,
      [t, t, t, tope]
    );
  }

  async findById(id) {
    return await getSingleQuery(
      `SELECT ${INVOICE_COLUMNS},
        c.document_id   AS client_document_id,
        c.document_type AS client_document_type,
        c.address       AS client_address,
        c.phone         AS client_phone,
        c.email         AS client_email,
        COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.invoice_id = inv.id AND p.status = 'pagado'
        ), 0) AS paid
       ${INVOICE_JOINS}
       WHERE inv.id = ?`,
      [id]
    );
  }

  /**
   * Todo lo que el PDF necesita, en una sola llamada. Mismo contrato que el
   * `/document` de Cloud: cabecera con las referencias resueltas y lineas.
   *
   * `order_number` se SINTETIZA -Desktop no tiene esa columna en
   * `work_orders`-, con el mismo formato que ya usa el resto de la app
   * (`numero(wo)` en `work_orders/+page.svelte`).
   */
  async findForDocument(invoiceId) {
    const invoice = await this.findById(invoiceId);
    if (!invoice) return null;
    const items = await this.listItems(invoiceId);
    const saldo = round2(Number(invoice.total || 0) - Number(invoice.paid || 0));

    return {
      invoice: {
        ...invoice,
        client_document: invoice.client_document_id ?? null,
        order_number: invoice.work_order_id ? `WO-${String(invoice.work_order_id).padStart(5, '0')}` : null,
        balance: saldo > 0 ? saldo : 0
      },
      items
    };
  }

  async listItems(invoiceId) {
    return await getQuery(
      `SELECT ii.*, i.internal_code
       FROM invoice_items ii
       LEFT JOIN items i ON i.id = ii.item_id
       WHERE ii.invoice_id = ?
       ORDER BY ii.id`,
      [invoiceId]
    );
  }

  /** Incluye los enlaces liberados por una anulacion: son historia, no ruido. */
  async listConduces(invoiceId) {
    return await getQuery(
      `SELECT ic.id, ic.invoice_id, ic.conduce_id, ic.is_active,
              co.date, co.total, co.status AS conduce_status
       FROM invoice_conduces ic
       JOIN conduces co ON co.id = ic.conduce_id
       WHERE ic.invoice_id = ?
       ORDER BY ic.id`,
      [invoiceId]
    );
  }

  /**
   * `options.alsoClaimedByInvoiceId`: no cuenta como "ya facturado" lo que
   * reclama esa factura en concreto -la pantalla de edicion de un borrador
   * necesita seguir viendo sus propias entregas ya elegidas en el picker-.
   */
  async listBillableConduces(workOrderId, options = {}) {
    const alsoClaimed = options.alsoClaimedByInvoiceId || null;
    let billable = BILLABLE_CONDUCE_SQL;
    // `already_claimed`: sin esto la pantalla de edicion no puede distinguir
    // "disponible de verdad" de "disponible solo porque es mio" -ambos casos
    // pasan el `billable` de abajo-.
    let alreadyClaimedExpr = '0';
    if (alsoClaimed) {
      billable = `
        co.is_active = 1
        AND co.status <> 'anulado'
        AND NOT EXISTS (
          SELECT 1 FROM invoice_conduces ic
          WHERE ic.conduce_id = co.id AND ic.is_active = 1 AND ic.invoice_id <> ?
        )
      `;
      alreadyClaimedExpr = `EXISTS (
        SELECT 1 FROM invoice_conduces ic2
        WHERE ic2.conduce_id = co.id AND ic2.is_active = 1 AND ic2.invoice_id = ?
      )`;
    }
    // Orden POSICIONAL de los `?`, tal cual aparecen en el SQL final: el nuevo
    // `already_claimed` va en el SELECT -antes del WHERE en el texto-, asi que
    // su parametro es el PRIMERO, no el ultimo.
    const params = alsoClaimed ? [alsoClaimed, workOrderId, alsoClaimed] : [workOrderId];
    return await getQuery(
      `SELECT co.id, co.date, co.total, co.discount, co.driver_or_vehicle,
              (SELECT COUNT(*) FROM conduce_items ci WHERE ci.conduce_id = co.id) AS lineas,
              (${alreadyClaimedExpr}) AS already_claimed
       FROM conduces co
       WHERE co.work_order_id = ? AND ${billable}
       ORDER BY co.id`,
      params
    );
  }

  /**
   * Lineas de Servicio de una orden que todavia no cubre ninguna factura
   * viva. Un Servicio se factura una sola vez -no hay entrega parcial que
   * valga-, asi que basta con listar la linea entera.
   *
   * El precio sale de `services.price`, NO de `work_order_items`: esa tabla
   * es solo lista de preparacion en SQLite y no tiene columna de precio, ni
   * siquiera para los articulos.
   *
   * `options.alsoClaimedByInvoiceId`: espejo de la excepcion de `listBillableConduces`.
   */
  async listBillableServices(workOrderId, options = {}) {
    const alsoClaimed = options.alsoClaimedByInvoiceId || null;
    let serviceNotBilled = SERVICE_NOT_BILLED;
    let alreadyClaimedExpr = '0';
    if (alsoClaimed) {
      serviceNotBilled = `
        NOT EXISTS (
          SELECT 1 FROM invoice_work_order_items iwi
          WHERE iwi.work_order_item_id = woi.id AND iwi.is_active = 1 AND iwi.invoice_id <> ?
        )
      `;
      alreadyClaimedExpr = `EXISTS (
        SELECT 1 FROM invoice_work_order_items iwi2
        WHERE iwi2.work_order_item_id = woi.id AND iwi2.is_active = 1 AND iwi2.invoice_id = ?
      )`;
    }
    // Mismo orden posicional que `listBillableConduces`: already_claimed
    // (SELECT) primero, work_order_id (WHERE) despues, la exclusion al final.
    const params = alsoClaimed ? [alsoClaimed, workOrderId, alsoClaimed] : [workOrderId];
    return await getQuery(
      `SELECT woi.id, woi.service_id, s.name, woi.quantity, s.price,
              (${alreadyClaimedExpr}) AS already_claimed
       FROM work_order_items woi
       JOIN services s ON s.id = woi.service_id
       WHERE woi.work_order_id = ? AND woi.service_id IS NOT NULL AND ${serviceNotBilled}
       ORDER BY woi.id`,
      params
    );
  }

  /**
   * Ordenes con alguna entrega o servicio sin facturar.
   *
   * `since` acota por fecha porque el dia que se instala el modulo TODAS las
   * entregas historicas —incluidas las ya cobradas en efectivo fuera del
   * sistema— aparecerian como pendientes. La pantalla lo usa con los ultimos
   * meses por defecto y ofrece ver el resto.
   *
   * Subconsultas y no `JOIN conduces` + `GROUP BY`: un `JOIN` deja fuera toda
   * orden sin ningun conduce, y una orden puede tener solo servicios
   * pendientes -un Servicio nunca genera conduce-.
   */
  async listOrdersWithBillable({ since } = {}) {
    const params = [];
    let filtroFecha = '';
    if (since) {
      filtroFecha = 'AND wo.date >= ?';
      params.push(since);
    }

    const conducesPendientes = `(SELECT COUNT(*) FROM conduces co
      WHERE co.work_order_id = wo.id AND ${BILLABLE_CONDUCE_SQL})`;
    const totalConducesPendiente = `(SELECT COALESCE(SUM(co.total), 0) FROM conduces co
      WHERE co.work_order_id = wo.id AND ${BILLABLE_CONDUCE_SQL})`;
    const serviciosPendientes = `(SELECT COUNT(*) FROM work_order_items woi
      WHERE woi.work_order_id = wo.id AND woi.service_id IS NOT NULL AND ${SERVICE_NOT_BILLED})`;
    const totalServiciosPendiente = `(SELECT COALESCE(SUM(woi.quantity * s.price), 0)
      FROM work_order_items woi JOIN services s ON s.id = woi.service_id
      WHERE woi.work_order_id = wo.id AND woi.service_id IS NOT NULL AND ${SERVICE_NOT_BILLED})`;

    return await getQuery(
      `SELECT wo.id, wo.date, c.name AS client_name,
              (${conducesPendientes} + ${serviciosPendientes}) AS pendientes,
              (${totalConducesPendiente} + ${totalServiciosPendiente}) AS total_pendiente
       FROM work_orders wo
       LEFT JOIN clients c ON c.id = wo.client_id
       WHERE (${conducesPendientes} > 0 OR ${serviciosPendientes} > 0) ${filtroFecha}
       ORDER BY wo.id DESC
       LIMIT 200`,
      params
    );
  }

  /**
   * Lineas de una cotizacion con cantidad pendiente de facturar DIRECTO.
   *
   * Deja fuera las lineas de paquete heredadas (`package_id` sin `item_id` ni
   * `service_id`): son el mismo caso que ya descarta la importacion a una
   * orden, y no tienen nada que facturar por si solas.
   *
   * `options.alsoClaimedByInvoiceId`: espejo de la excepcion de
   * `listBillableConduces`, pero con una vuelta de tuerca. La expresion
   * parametrizada de "cuanto ya se facturo" aparece CUATRO VECES en esta
   * consulta -en `billed_quantity`, dentro de `remaining`, en
   * `claimed_quantity` (cuanto reclama YA esta factura en concreto, para que
   * la pantalla de edicion pueda pre-rellenar la cantidad), y otra vez dentro
   * del `WHERE` via `remaining`-, mas `quotation_id` suelto en el medio.
   * SQLite resuelve `?` POSICIONALMENTE y este archivo no usa los `?NNN` con
   * nombre -mezclarlos con el resto del archivo, que es todo `?` a secas,
   * invita a un desajuste peor-, asi que el orden en `params` sigue el mismo
   * orden en que aparecen en el SQL final: 1) `billed_quantity`,
   * 2) `remaining`, 3) `claimed_quantity`, 4) `qi.quotation_id = ?`, 5) el
   * `WHERE` final (que vuelve a usar `remaining`).
   */
  async listBillableQuotationItems(quotationId, options = {}) {
    const alsoClaimed = options.alsoClaimedByInvoiceId || null;
    const billedQty = alsoClaimed
      ? `COALESCE((
          SELECT SUM(iqi.quantity) FROM invoice_quotation_items iqi
          WHERE iqi.quotation_item_id = qi.id AND iqi.is_active = 1 AND iqi.invoice_id <> ?
        ), 0)`
      : QUOTE_LINE_BILLED_QTY;
    const remaining = `(qi.quantity - ${billedQty})`;
    const notBilled = `${remaining} > 0`;
    const claimedQty = alsoClaimed
      ? `COALESCE((
          SELECT SUM(iqi2.quantity) FROM invoice_quotation_items iqi2
          WHERE iqi2.quotation_item_id = qi.id AND iqi2.is_active = 1 AND iqi2.invoice_id = ?
        ), 0)`
      : '0';
    const params = alsoClaimed
      ? [alsoClaimed, alsoClaimed, alsoClaimed, quotationId, alsoClaimed]
      : [quotationId];

    return await getQuery(
      // `quotation_items` en SQLite no tiene columna `name` -a diferencia de
      // Postgres-: el nombre siempre sale del articulo o del servicio.
      `SELECT qi.id, qi.item_id, qi.service_id,
              COALESCE(i.name, s.name) AS name, i.internal_code,
              qi.quantity,
              (${billedQty}) AS billed_quantity,
              (${remaining}) AS remaining,
              (${claimedQty}) AS claimed_quantity,
              qi.price,
              COALESCE(qi.discount_rate, 0) AS discount_rate,
              COALESCE(qi.tax_rate, 0) AS tax_rate
       FROM quotation_items qi
       LEFT JOIN items i ON i.id = qi.item_id
       LEFT JOIN services s ON s.id = qi.service_id
       WHERE qi.quotation_id = ?
         AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL)
         AND ${notBilled}
       ORDER BY qi.id`,
      params
    );
  }

  /** Cotizaciones aprobadas con algo pendiente de facturar directo. Espejo de `listOrdersWithBillable`. */
  async listQuotationsWithBillable({ since } = {}) {
    const params = [];
    let filtroFecha = '';
    if (since) {
      filtroFecha = 'AND q.date >= ?';
      params.push(since);
    }

    const pendientes = `(SELECT COUNT(*) FROM quotation_items qi
      WHERE qi.quotation_id = q.id AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL) AND ${QUOTE_LINE_NOT_BILLED})`;
    const totalPendiente = `(SELECT COALESCE(SUM(${QUOTE_LINE_REMAINING} * qi.price), 0) FROM quotation_items qi
      WHERE qi.quotation_id = q.id AND (qi.item_id IS NOT NULL OR qi.service_id IS NOT NULL) AND ${QUOTE_LINE_NOT_BILLED})`;

    return await getQuery(
      `SELECT q.id, q.quote_number, q.client_id, c.name AS client_name, q.date,
              (${pendientes}) AS pendientes,
              (${totalPendiente}) AS total_pendiente
       FROM quotations q
       LEFT JOIN clients c ON c.id = q.client_id
       WHERE q.status = 'aprobada' AND q.is_active = 1
         AND (${pendientes}) > 0 ${filtroFecha}
       ORDER BY q.id DESC
       LIMIT 200`,
      params
    );
  }

  /** Los enlaces de cotizacion de la factura, los liberados por una anulacion incluidos. */
  async listQuotationItems(invoiceId) {
    return await getQuery(
      `SELECT iqi.id, iqi.invoice_id, iqi.quotation_item_id, iqi.quantity, iqi.is_active,
              COALESCE(i.name, s.name) AS name
       FROM invoice_quotation_items iqi
       JOIN quotation_items qi ON qi.id = iqi.quotation_item_id
       LEFT JOIN items i ON i.id = qi.item_id
       LEFT JOIN services s ON s.id = qi.service_id
       WHERE iqi.invoice_id = ?
       ORDER BY iqi.id`,
      [invoiceId]
    );
  }

  /** La factura viva que cubre una entrega, si la hay. */
  async findActiveByConduce(conduceId) {
    return await getSingleQuery(
      `SELECT inv.id, inv.invoice_number, inv.status, inv.total
       FROM invoice_conduces ic
       JOIN invoices inv ON inv.id = ic.invoice_id
       WHERE ic.conduce_id = ? AND ic.is_active = 1
       LIMIT 1`,
      [conduceId]
    );
  }

  /**
   * Las lineas que saldrian de facturar esos conduces, SIN escribir nada.
   *
   * Existe para que la vista previa de la emision no reimplemente la agregacion
   * en el renderer: es la misma funcion que despues escribe. Calcularla dos
   * veces garantiza que algun dia el usuario vea un total y firme otro.
   */
  async previewLines(conduceIds = []) {
    const lineas = await this.txAggregateLines(conduceIds);
    const subtotal = round2(lineas.reduce((suma, l) => suma + l.total, 0));
    return { lineas, subtotal };
  }

  /**
   * Agrupa por articulo Y precio.
   *
   * El mismo articulo entregado en dos tandas es UNA linea; a dos precios
   * distintos son DOS, porque fusionarlas inventaria un precio que nadie acordo.
   */
  async txAggregateLines(conduceIds = []) {
    const ids = (conduceIds || []).map(Number).filter(Boolean);
    if (!ids.length) return [];

    const marcas = ids.map(() => '?').join(', ');
    const filas = await getQuery(
      `SELECT ci.item_id, ci.quantity, ci.price, i.name
       FROM conduce_items ci
       LEFT JOIN items i ON i.id = ci.item_id
       WHERE ci.conduce_id IN (${marcas})
       ORDER BY ci.id`,
      ids
    );

    const acumulado = new Map();
    for (const fila of filas) {
      const cantidad = Number(fila.quantity || 0);
      if (cantidad <= 0) continue;
      const precio = round2(fila.price);
      const clave = `${fila.item_id ?? 'libre'}|${precio}`;
      const previo = acumulado.get(clave);
      if (previo) {
        previo.quantity = round2(previo.quantity + cantidad);
        previo.total = round2(previo.quantity * previo.price);
        continue;
      }
      acumulado.set(clave, {
        item_id: fila.item_id ?? null,
        description: fila.name || null,
        quantity: round2(cantidad),
        price: precio,
        total: round2(cantidad * precio)
      });
    }

    return [...acumulado.values()];
  }

  // ── Escritura ───────────────────────────────────────────────────────────

  /**
   * Emite una factura desde cualquiera de sus tres origenes posibles -ver
   * `InvoiceDraft` en `@esr/core`-: orden (`work_order`), cotizacion
   * facturada DIRECTO y por partes (`quotation`), o factura libre (`free`).
   *
   * `withTransaction` ya serializa TODAS las transacciones de la app en una
   * cola -"solo hay una transaccion viva a la vez"-, asi que a diferencia de
   * Postgres no hace falta ningun `SELECT ... FOR UPDATE`: no hay dos
   * emisiones corriendo a la vez que puedan repartirse de mas la misma
   * cantidad pendiente.
   */
  async create(input = {}) {
    const check = validateInvoiceDraft(input);
    if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

    return await withTransaction(async () => {
      const { source } = input;
      const prepared =
        source.kind === 'work_order'
          ? await this.prepareFromWorkOrder(source)
          : source.kind === 'quotation'
            ? await this.prepareFromQuotation(source)
            : await this.prepareFree(source);

      // Una sola formula para los tres caminos, la misma que la cotizacion.
      const totales = calculateQuoteTotals(prepared.lines);
      const rebaja = round2(totales.discount + Math.max(0, Number(input.discount) || 0));
      const impuesto = round2(totales.tax_amount + Math.max(0, Number(input.tax_amount) || 0));
      if (rebaja > totales.subtotal) throw new Error('El descuento no puede superar el subtotal.');

      const factura = await this.txInsertHeaderWithNumber({
        work_order_id: prepared.work_order_id,
        quotation_id: prepared.quotation_id,
        client_id: prepared.client_id,
        date: input.date,
        due_date: input.due_date,
        subtotal: totales.subtotal,
        discount: rebaja,
        tax_amount: impuesto,
        total: round2(totales.subtotal - rebaja + impuesto),
        notes: input.notes
      });

      for (const linea of prepared.lines) {
        await runQuery(
          `INSERT INTO invoice_items
             (invoice_id, item_id, service_id, description, quantity, price, total, discount_rate, tax_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            factura.id,
            linea.item_id,
            linea.service_id,
            linea.description,
            linea.quantity,
            linea.price,
            round2(linea.quantity * linea.price),
            linea.discount_rate,
            linea.tax_rate
          ]
        );
      }

      // Los enlaces van DENTRO de la transaccion: son la invariante que impide
      // facturar dos veces lo mismo. Escribirlos fuera abriria la ventana del
      // doble clic.
      for (const conduceId of prepared.links.conduces) {
        await runQuery(
          'INSERT INTO invoice_conduces (invoice_id, conduce_id, is_active) VALUES (?, ?, 1)',
          [factura.id, conduceId]
        );
      }
      for (const workOrderItemId of prepared.links.workOrderItems) {
        await this.linkWorkOrderItem(factura.id, workOrderItemId);
      }
      for (const linea of prepared.links.quotationItems) {
        await this.linkQuotationItem(factura.id, linea.id, linea.quantity);
      }

      return factura;
    });
  }

  /** Origen Orden: el camino de siempre, sin cambios de comportamiento. */
  async prepareFromWorkOrder(source) {
    const elegidos = (source.conduce_ids || []).map(Number).filter(Boolean);
    const serviciosElegidos = (source.service_line_ids || []).map(Number).filter(Boolean);

    // Se releen DENTRO de la transaccion. Entre que se pinto la pantalla y se
    // pulso el boton, otra emision pudo llevarse una entrega o un servicio.
    const lineas = [];
    if (elegidos.length) {
      const disponibles = await this.listBillableConduces(source.work_order_id);
      const porId = new Set(disponibles.map((c) => Number(c.id)));
      if (elegidos.some((id) => !porId.has(id))) {
        throw new Error(
          'Alguna de las entregas elegidas ya se facturó o dejó de estar disponible. Vuelva a cargar la pantalla.'
        );
      }
      for (const linea of await this.txAggregateLines(elegidos)) {
        lineas.push({
          item_id: linea.item_id,
          service_id: null,
          description: linea.description,
          quantity: linea.quantity,
          price: linea.price,
          discount_rate: 0,
          tax_rate: 0
        });
      }
    }

    let serviciosAFacturar = [];
    if (serviciosElegidos.length) {
      const disponibles = await this.listBillableServices(source.work_order_id);
      const porId = new Map(disponibles.map((s) => [Number(s.id), s]));
      if (serviciosElegidos.some((id) => !porId.has(id))) {
        throw new Error(
          'Alguno de los servicios elegidos ya se facturó o dejó de estar disponible. Vuelva a cargar la pantalla.'
        );
      }
      serviciosAFacturar = serviciosElegidos.map((id) => porId.get(id));
    }

    // Un Servicio NO se fusiona con otro aunque coincidan nombre y precio:
    // cada linea de la orden se factura por separado, una por una.
    for (const servicio of serviciosAFacturar) {
      lineas.push({
        item_id: null,
        service_id: servicio.service_id,
        description: servicio.name,
        quantity: round2(servicio.quantity),
        price: round2(servicio.price),
        discount_rate: 0,
        tax_rate: 0
      });
    }

    if (!lineas.length) throw new Error('Lo elegido no tiene ninguna línea que facturar.');

    const orden = await getSingleQuery(
      'SELECT id, client_id FROM work_orders WHERE id = ?',
      [source.work_order_id]
    );
    if (!orden) throw new Error('La orden de trabajo no existe.');

    return {
      client_id: orden.client_id,
      work_order_id: source.work_order_id,
      quotation_id: null,
      lines: lineas,
      links: { conduces: elegidos, workOrderItems: serviciosElegidos, quotationItems: [] }
    };
  }

  /**
   * Origen Cotizacion: facturacion DIRECTA, sin orden, y POR PARTES.
   *
   * El precio, el descuento y el impuesto se copian TAL CUAL de la
   * cotizacion -es el acuerdo comercial que el cliente ya aprobo, no se
   * re-cotiza-. Solo la cantidad puede ser menor que la de la linea
   * original: es justo lo que habilita facturar una parte ahora y el resto
   * despues.
   */
  async prepareFromQuotation(source) {
    const quote = await getSingleQuery(
      'SELECT id, client_id, status FROM quotations WHERE id = ?',
      [source.quotation_id]
    );
    if (!quote) throw new Error('La cotización no existe.');

    const disponibles = await this.listBillableQuotationItems(source.quotation_id);
    const porId = new Map(disponibles.map((row) => [Number(row.id), row]));

    const check = validateQuoteCanInvoiceDirectly(quote, disponibles);
    if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

    const lineas = [];
    const enlaces = [];
    for (const elegida of source.lines || []) {
      const fila = porId.get(Number(elegida.quotation_item_id));
      const cantidad = round2(Number(elegida.quantity));
      if (!fila || cantidad <= 0 || cantidad > Number(fila.remaining)) {
        throw new Error(
          'Alguna de las líneas elegidas ya se facturó o cambió de cantidad. Vuelva a cargar la pantalla.'
        );
      }

      lineas.push({
        item_id: fila.item_id,
        service_id: fila.service_id,
        description: fila.name,
        quantity: cantidad,
        price: round2(fila.price),
        discount_rate: Number(fila.discount_rate) || 0,
        tax_rate: Number(fila.tax_rate) || 0
      });
      enlaces.push({ id: fila.id, quantity: cantidad });
    }

    return {
      client_id: quote.client_id,
      work_order_id: null,
      quotation_id: source.quotation_id,
      lines: lineas,
      links: { conduces: [], workOrderItems: [], quotationItems: enlaces }
    };
  }

  /**
   * Origen libre: sin cotizacion ni orden. Verifica que cada articulo o
   * servicio posteado de verdad existe -ESR Pro es de un solo inquilino, asi
   * que no hace falta reverificar pertenencia de empresa como en Cloud, pero
   * si que el id sea real y este activo-. Un cargo manual (ni `item_id` ni
   * `service_id`) no tiene nada que verificar: su unico dato es el texto que
   * trae.
   *
   * Deliberadamente NO reserva stock ni crea ningun rastro de entrega para
   * un Articulo facturado aqui: la factura nunca ha tocado el inventario y
   * esta no es la excepcion.
   */
  async prepareFree(source) {
    const cliente = await getSingleQuery('SELECT id FROM clients WHERE id = ?', [source.client_id]);
    if (!cliente) throw new Error('El cliente no existe.');

    const nombresArticulo = new Map();
    const nombresServicio = new Map();
    const lineas = [];

    for (const linea of source.lines || []) {
      let descripcion = String(linea.description || '').trim() || null;

      if (linea.item_id) {
        const clave = String(linea.item_id);
        if (!nombresArticulo.has(clave)) {
          const item = await getSingleQuery('SELECT id, name, is_active FROM items WHERE id = ?', [linea.item_id]);
          if (!item) throw new Error('Uno de los artículos no existe.');
          if (Number(item.is_active) !== 1) {
            throw new Error(`El artículo "${item.name}" está inactivo o archivado y no puede facturarse.`);
          }
          nombresArticulo.set(clave, item.name);
        }
        descripcion = nombresArticulo.get(clave);
      } else if (linea.service_id) {
        const clave = String(linea.service_id);
        if (!nombresServicio.has(clave)) {
          const service = await getSingleQuery('SELECT id, name, is_active FROM services WHERE id = ?', [linea.service_id]);
          if (!service) throw new Error('Uno de los servicios no existe.');
          if (Number(service.is_active) !== 1) {
            throw new Error(`El servicio "${service.name}" está inactivo o archivado y no puede facturarse.`);
          }
          nombresServicio.set(clave, service.name);
        }
        descripcion = nombresServicio.get(clave);
      }

      lineas.push({
        item_id: linea.item_id || null,
        service_id: linea.service_id || null,
        description: descripcion,
        quantity: round2(Number(linea.quantity)),
        price: round2(Number(linea.price)),
        discount_rate: Number(linea.discount_rate) || 0,
        tax_rate: Number(linea.tax_rate) || 0
      });
    }

    return {
      client_id: cliente.id,
      work_order_id: null,
      quotation_id: null,
      lines: lineas,
      links: { conduces: [], workOrderItems: [], quotationItems: [] }
    };
  }

  /** Vincula una linea de Servicio facturada. Espejo de la insercion en `invoice_conduces`. */
  async linkWorkOrderItem(invoiceId, workOrderItemId) {
    await runQuery(
      'INSERT INTO invoice_work_order_items (invoice_id, work_order_item_id, is_active) VALUES (?, ?, 1)',
      [invoiceId, workOrderItemId]
    );
  }

  /** Vincula una linea de cotizacion facturada DIRECTO, con cuanto se factura. */
  async linkQuotationItem(invoiceId, quotationItemId, quantity) {
    await runQuery(
      'INSERT INTO invoice_quotation_items (invoice_id, quotation_item_id, quantity, is_active) VALUES (?, ?, ?, 1)',
      [invoiceId, quotationItemId, quantity]
    );
  }

  /**
   * Cabecera con numero, reintentando si otro se lo llevo.
   *
   * A diferencia de Cloud, aqui NO hace falta SAVEPOINT: en PostgreSQL una
   * violacion de unicidad aborta la transaccion entera, pero en SQLite el
   * conflicto por defecto es ABORT, que deshace solo la sentencia y deja la
   * transaccion viva. No lo «arregle» copiando Cloud.
   */
  async txInsertHeaderWithNumber(data) {
    for (let intento = 0; intento < 5; intento += 1) {
      const fila = await getSingleQuery(
        'SELECT COALESCE(MAX(invoice_seq), 0) + 1 AS siguiente FROM invoices'
      );
      const seq = Number(fila?.siguiente || 1);
      const numero = `FAC-${String(seq).padStart(6, '0')}`;

      try {
        const res = await runQuery(
          `INSERT INTO invoices
            (invoice_seq, invoice_number, work_order_id, quotation_id, client_id, date, due_date,
             status, subtotal, discount, tax_amount, total, notes, is_active)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, date('now')), ?, 'borrador', ?, ?, ?, ?, ?, 1)`,
          [
            seq,
            numero,
            data.work_order_id || null,
            data.quotation_id || null,
            data.client_id || null,
            data.date || null,
            data.due_date || null,
            data.subtotal,
            data.discount,
            data.tax_amount,
            data.total,
            data.notes || null
          ]
        );
        return { id: res.id, invoice_seq: seq, invoice_number: numero, total: data.total };
      } catch (error) {
        if (!String(error.message || '').includes('SQLITE_CONSTRAINT')) throw error;
      }
    }
    throw new Error('No se pudo asignar un número de factura libre. Vuelva a intentarlo.');
  }

  /**
   * Anula la factura, libera sus entregas y anula sus cobros. Todo o nada.
   *
   * Devuelve cuantos cobros anulo: la pantalla tiene que decirlo, porque anular
   * una factura cobrada deshace dinero ya registrado.
   */
  async cancel(id, reason, paymentRepository) {
    const motivo = String(reason || '').trim();
    if (!motivo) throw new Error('Indique el motivo de la anulación.');

    return await withTransaction(async () => {
      // Idempotencia por SQL, no por lectura previa: entre el SELECT y el
      // UPDATE cabria otra anulacion.
      const res = await runQuery(
        `UPDATE invoices
         SET status = 'anulada', cancelled_at = datetime('now'),
             cancel_reason = ?, updated_at = datetime('now')
         WHERE id = ? AND status <> 'anulada'`,
        [motivo, id]
      );
      if (!res.changes) throw new Error('La factura no existe o ya estaba anulada.');

      await runQuery('UPDATE invoice_conduces SET is_active = 0 WHERE invoice_id = ?', [id]);
      await runQuery('UPDATE invoice_work_order_items SET is_active = 0 WHERE invoice_id = ?', [id]);
      await runQuery('UPDATE invoice_quotation_items SET is_active = 0 WHERE invoice_id = ?', [id]);

      const voidedPayments = await paymentRepository.txVoidByInvoice(id, motivo);
      return { id, voidedPayments };
    });
  }

  /**
   * Reescribe un borrador entero -cabecera y lineas, del origen que sea-.
   *
   * Mismo mecanismo que `create()`: suelta TODO lo que este borrador tenia
   * reclamado (mismo paso que `cancel()`), relee disponibilidad actual con los
   * mismos `prepareFrom*` sin modificar, y reclama de nuevo. Es reemplazo
   * COMPLETO, no un diff: quien llama siempre manda la seleccion entera
   * deseada, igual que ya hace `create()`.
   */
  async updateDraft(id, input = {}) {
    const check = validateInvoiceDraft(input);
    if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

    return await withTransaction(async () => {
      const factura = await getSingleQuery(
        'SELECT id, invoice_number, status, work_order_id, quotation_id FROM invoices WHERE id = ?',
        [id]
      );
      if (!factura) throw new Error('La factura no existe.');

      const editCheck = validateInvoiceCanEdit(factura);
      if (!editCheck.ok) throw new Error(invoiceDraftErrorMessage(editCheck.error));
      const originCheck = validateInvoiceSourceUnchanged(factura, input.source);
      if (!originCheck.ok) throw new Error(invoiceDraftErrorMessage(originCheck.error));

      // Release-antes-de-reclamar: mismo paso que `cancel()`, para que
      // `prepareFrom*` -sin modificar- vuelva a ver disponible lo que este
      // borrador tenia reclamado al releer.
      await runQuery('UPDATE invoice_conduces SET is_active = 0 WHERE invoice_id = ?', [id]);
      await runQuery('UPDATE invoice_work_order_items SET is_active = 0 WHERE invoice_id = ?', [id]);
      await runQuery('UPDATE invoice_quotation_items SET is_active = 0 WHERE invoice_id = ?', [id]);
      await runQuery('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);

      const { source } = input;
      const prepared =
        source.kind === 'work_order'
          ? await this.prepareFromWorkOrder(source)
          : source.kind === 'quotation'
            ? await this.prepareFromQuotation(source)
            : await this.prepareFree(source);

      // Misma formula que `create()`.
      const totales = calculateQuoteTotals(prepared.lines);
      const rebaja = round2(totales.discount + Math.max(0, Number(input.discount) || 0));
      const impuesto = round2(totales.tax_amount + Math.max(0, Number(input.tax_amount) || 0));
      if (rebaja > totales.subtotal) throw new Error('El descuento no puede superar el subtotal.');
      const total = round2(totales.subtotal - rebaja + impuesto);

      const res = await runQuery(
        `UPDATE invoices
         SET client_id = ?, date = ?, subtotal = ?, discount = ?, tax_amount = ?, total = ?, notes = ?,
             updated_at = datetime('now')
         WHERE id = ? AND status = 'borrador'`,
        [prepared.client_id, input.date || null, totales.subtotal, rebaja, impuesto, total, input.notes || null, id]
      );
      if (!res.changes) throw new Error(`La factura ${id} no existe o ya no es un borrador.`);

      for (const linea of prepared.lines) {
        await runQuery(
          `INSERT INTO invoice_items
             (invoice_id, item_id, service_id, description, quantity, price, total, discount_rate, tax_rate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            linea.item_id,
            linea.service_id,
            linea.description,
            linea.quantity,
            linea.price,
            round2(linea.quantity * linea.price),
            linea.discount_rate,
            linea.tax_rate
          ]
        );
      }

      for (const conduceId of prepared.links.conduces) {
        await runQuery(
          'INSERT INTO invoice_conduces (invoice_id, conduce_id, is_active) VALUES (?, ?, 1)',
          [id, conduceId]
        );
      }
      for (const workOrderItemId of prepared.links.workOrderItems) {
        await this.linkWorkOrderItem(id, workOrderItemId);
      }
      for (const linea of prepared.links.quotationItems) {
        await this.linkQuotationItem(id, linea.id, linea.quantity);
      }

      return await this.findById(id);
    });
  }

  /** Finaliza el borrador: exige al menos una linea. Sin cascada -los enlaces ya se reclamaron en `create()`/`updateDraft()`-. */
  async finalize(id) {
    return await withTransaction(async () => {
      const factura = await getSingleQuery('SELECT id, status FROM invoices WHERE id = ?', [id]);
      if (!factura) throw new Error('La factura no existe.');
      const items = await this.listItems(id);
      const check = validateInvoiceCanFinalize(factura, items.length);
      if (!check.ok) throw new Error(invoiceDraftErrorMessage(check.error));

      const res = await runQuery(
        `UPDATE invoices SET status = 'emitida', updated_at = datetime('now') WHERE id = ? AND status = 'borrador'`,
        [id]
      );
      if (!res.changes) throw new Error(`La factura ${id} no existe o ya no es un borrador.`);
      return await this.findById(id);
    });
  }

  /** Estado de circulacion 1/2/0. No toca `status`: son dos ejes distintos. */
  async setState(id, state) {
    const valor = Number(state);
    if (![0, 1, 2].includes(valor)) throw new Error('Estado no válido.');
    await runQuery(
      "UPDATE invoices SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
      [valor, id]
    );
  }
}

module.exports = {
  SqliteInvoiceRepository,
  BILLABLE_CONDUCE_SQL,
  SERVICE_NOT_BILLED,
  QUOTE_LINE_BILLED_QTY,
  QUOTE_LINE_REMAINING,
  QUOTE_LINE_NOT_BILLED,
  round2
};
