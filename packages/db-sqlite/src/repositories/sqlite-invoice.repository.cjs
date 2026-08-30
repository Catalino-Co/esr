const {
  getQuery,
  getSingleQuery,
  runQuery,
  withTransaction
} = require('../connection.cjs');

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

const INVOICE_COLUMNS = `
  inv.*,
  c.name AS client_name,
  wo.id  AS order_ref
`;

const INVOICE_JOINS = `
  FROM invoices inv
  LEFT JOIN clients c      ON c.id = inv.client_id
  LEFT JOIN work_orders wo ON wo.id = inv.work_order_id
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
    if (filters.search) {
      where.push('(inv.invoice_number LIKE ? OR c.name LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
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

  async findById(id) {
    return await getSingleQuery(
      `SELECT ${INVOICE_COLUMNS},
        c.document_id AS client_document_id,
        c.address     AS client_address,
        c.phone       AS client_phone,
        COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.invoice_id = inv.id AND p.status = 'pagado'
        ), 0) AS paid
       ${INVOICE_JOINS}
       WHERE inv.id = ?`,
      [id]
    );
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

  async listBillableConduces(workOrderId) {
    return await getQuery(
      `SELECT co.id, co.date, co.total, co.discount, co.driver_or_vehicle,
              (SELECT COUNT(*) FROM conduce_items ci WHERE ci.conduce_id = co.id) AS lineas
       FROM conduces co
       WHERE co.work_order_id = ? AND ${BILLABLE_CONDUCE_SQL}
       ORDER BY co.id`,
      [workOrderId]
    );
  }

  /**
   * Ordenes con alguna entrega sin facturar.
   *
   * `since` acota por fecha porque el dia que se instala el modulo TODAS las
   * entregas historicas —incluidas las ya cobradas en efectivo fuera del
   * sistema— aparecerian como pendientes. La pantalla lo usa con los ultimos
   * meses por defecto y ofrece ver el resto.
   */
  async listOrdersWithBillable({ since } = {}) {
    const params = [];
    let filtroFecha = '';
    if (since) {
      filtroFecha = 'AND COALESCE(co.date, wo.date) >= ?';
      params.push(since);
    }

    return await getQuery(
      `SELECT wo.id, wo.date, c.name AS client_name,
              COUNT(co.id) AS pendientes,
              SUM(co.total) AS total_pendiente
       FROM work_orders wo
       JOIN conduces co ON co.work_order_id = wo.id
       LEFT JOIN clients c ON c.id = wo.client_id
       WHERE ${BILLABLE_CONDUCE_SQL} ${filtroFecha}
       GROUP BY wo.id, wo.date, c.name
       ORDER BY wo.id DESC
       LIMIT 200`,
      params
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

  async create({
    work_order_id,
    conduce_ids = [],
    date,
    due_date,
    discount = 0,
    tax_amount = 0,
    notes
  } = {}) {
    if (!work_order_id) throw new Error('Falta la orden de trabajo.');
    const elegidos = (conduce_ids || []).map(Number).filter(Boolean);
    if (!elegidos.length) throw new Error('Elija al menos una entrega para facturar.');

    return await withTransaction(async () => {
      // Se releen DENTRO de la transaccion. Entre que se pinto la pantalla y se
      // pulso el boton, otra emision pudo llevarse una entrega.
      const disponibles = await this.listBillableConduces(work_order_id);
      const porId = new Set(disponibles.map((c) => Number(c.id)));
      if (elegidos.some((id) => !porId.has(id))) {
        throw new Error(
          'Alguna de las entregas elegidas ya se facturó o dejó de estar disponible. Vuelva a cargar la pantalla.'
        );
      }

      const lineas = await this.txAggregateLines(elegidos);
      if (!lineas.length) {
        throw new Error('Las entregas elegidas no tienen ninguna línea que facturar.');
      }

      const subtotal = round2(lineas.reduce((suma, l) => suma + l.total, 0));
      const rebaja = round2(Math.max(0, Number(discount) || 0));
      const impuesto = round2(Math.max(0, Number(tax_amount) || 0));
      if (rebaja > subtotal) throw new Error('El descuento no puede superar el subtotal.');
      const total = round2(subtotal - rebaja + impuesto);

      const orden = await getSingleQuery(
        'SELECT id, client_id FROM work_orders WHERE id = ?',
        [work_order_id]
      );
      if (!orden) throw new Error('La orden de trabajo no existe.');

      const factura = await this.txInsertHeaderWithNumber({
        work_order_id,
        client_id: orden.client_id,
        date,
        due_date,
        subtotal,
        discount: rebaja,
        tax_amount: impuesto,
        total,
        notes
      });

      for (const linea of lineas) {
        await runQuery(
          `INSERT INTO invoice_items (invoice_id, item_id, description, quantity, price, total)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [factura.id, linea.item_id, linea.description, linea.quantity, linea.price, linea.total]
        );
      }

      // Los enlaces van DENTRO de la transaccion: son la invariante que impide
      // facturar dos veces la misma entrega. Escribirlos fuera abriria la
      // ventana del doble clic.
      for (const conduceId of elegidos) {
        await runQuery(
          'INSERT INTO invoice_conduces (invoice_id, conduce_id, is_active) VALUES (?, ?, 1)',
          [factura.id, conduceId]
        );
      }

      return factura;
    });
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
            (invoice_seq, invoice_number, work_order_id, client_id, date, due_date,
             status, subtotal, discount, tax_amount, total, notes, is_active)
           VALUES (?, ?, ?, ?, COALESCE(?, date('now')), ?, 'emitida', ?, ?, ?, ?, ?, 1)`,
          [
            seq,
            numero,
            data.work_order_id || null,
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

      const voidedPayments = await paymentRepository.txVoidByInvoice(id, motivo);
      return { id, voidedPayments };
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

module.exports = { SqliteInvoiceRepository, BILLABLE_CONDUCE_SQL, round2 };
