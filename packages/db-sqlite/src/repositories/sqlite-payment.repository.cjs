const { getQuery, getSingleQuery, runQuery, withTransaction } = require('../connection.cjs');
const { round2 } = require('./sqlite-invoice.repository.cjs');

/**
 * Cobros.
 *
 * Un cobro cuelga de UNA factura y de ninguna otra cosa. El saldo se calcula
 * sobre el total de la factura; los cobros anulados siguen en la tabla para
 * dejar rastro de que existieron, pero no cuentan.
 *
 * CONVENCION: `txVoidByInvoice` ASUME transaccion abierta —la usa la anulacion
 * de la factura— y por eso no hace BEGIN. Ver la cabecera del repositorio de
 * facturas.
 */
class SqlitePaymentRepository {
  async listForInvoice(invoiceId) {
    return await getQuery(
      'SELECT * FROM payments WHERE invoice_id = ? ORDER BY id DESC',
      [invoiceId]
    );
  }

  async findById(id) {
    return await getSingleQuery('SELECT * FROM payments WHERE id = ?', [id]);
  }

  /**
   * Registrar un cobro.
   *
   * Necesita transaccion aunque sea un solo INSERT: comprobar «la factura no
   * esta anulada» y escribir el cobro tienen que ser atomicos. Sin ella, anular
   * y cobrar a la vez deja un cobro vivo colgando de una factura muerta.
   */
  async create({ invoice_id, date, amount, method, reference, notes } = {}) {
    const importe = round2(amount);
    if (!Number.isFinite(importe) || importe <= 0) {
      throw new Error('El importe debe ser mayor que cero.');
    }

    return await withTransaction(async () => {
      const factura = await getSingleQuery(
        'SELECT id, client_id, status FROM invoices WHERE id = ?',
        [invoice_id]
      );
      if (!factura) throw new Error('La factura no existe.');
      if (factura.status === 'anulada') {
        throw new Error('Una factura anulada no admite cobros.');
      }

      const res = await runQuery(
        `INSERT INTO payments (invoice_id, client_id, date, amount, method, reference, status, notes)
         VALUES (?, ?, COALESCE(?, date('now')), ?, ?, ?, 'pagado', ?)`,
        [
          invoice_id,
          // El cliente se copia de la FACTURA, nunca del formulario: es la
          // factura la que sabe a quien se cobra.
          factura.client_id || null,
          date || null,
          importe,
          method || null,
          reference || null,
          notes || null
        ]
      );

      return { id: res.id, amount: importe };
    });
  }

  async voidPayment(id, reason) {
    const motivo = String(reason || '').trim();

    return await withTransaction(async () => {
      const res = await runQuery(
        `UPDATE payments
         SET status = 'anulado', voided_at = datetime('now'), void_reason = ?
         WHERE id = ? AND status <> 'anulado'`,
        [motivo || null, id]
      );
      if (!res.changes) throw new Error('Ese cobro no existe o ya estaba anulado.');
      return { id };
    });
  }

  /** Anula de golpe los cobros vivos de una factura. NO abre transaccion. */
  async txVoidByInvoice(invoiceId, reason) {
    const res = await runQuery(
      `UPDATE payments
       SET status = 'anulado', voided_at = datetime('now'), void_reason = ?
       WHERE invoice_id = ? AND status <> 'anulado'`,
      [String(reason || '').trim() || null, invoiceId]
    );
    return res.changes || 0;
  }

  /** Facturado, cobrado y saldo de un cliente. Las anuladas no cuentan. */
  async summaryForClient(clientId) {
    return await getSingleQuery(
      `SELECT
         COALESCE(SUM(inv.total), 0) AS facturado,
         COALESCE((
           SELECT SUM(p.amount) FROM payments p
           JOIN invoices i2 ON i2.id = p.invoice_id
           WHERE i2.client_id = ? AND i2.status <> 'anulada' AND p.status = 'pagado'
         ), 0) AS cobrado
       FROM invoices inv
       WHERE inv.client_id = ? AND inv.status <> 'anulada' AND inv.is_active = 1`,
      [clientId, clientId]
    );
  }
}

module.exports = { SqlitePaymentRepository };
