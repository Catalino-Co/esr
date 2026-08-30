const {
  findInsufficientStock,
  formatInsufficientStockDetail,
  shouldDeductStockForConduce,
  shouldReserveStock
} = require('@esr/core');
const { getDatabase, getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

/**
 * Stock: reservas de orden y descuentos de conduce.
 *
 * Hay DOS mecanismos que apartan mercancia y se solapan:
 *
 *   1. La ORDEN, al pasar a `preparado` o `cargado`, aparta TODAS sus lineas.
 *      Deja filas con `conduce_id IS NULL`.
 *   2. El CONDUCE, al emitirse o entregarse, descuenta las suyas. Deja filas
 *      con `conduce_id = N`.
 *
 * Si la orden ya aparto el total, el conduce NO vuelve a descontar: seria
 * contarlo dos veces. Antes eso se resolvia mirando si la orden tenia
 * «alguna» reserva, y el efecto colateral era que **el segundo conduce de una
 * orden nunca descontaba**. Ahora cada conduce lleva su propia cuenta
 * (migracion 0004).
 */
class SqliteInventoryRepository {
  async findById(id) {
    return await getSingleQuery('SELECT * FROM items WHERE id = ?', [id]);
  }

  async findAvailableByDateRange(input = {}) {
    const params = [];
    const where = ['i.is_active = 1'];

    if (input.item_id) {
      where.push('i.id = ?');
      params.push(input.item_id);
    }

    return await getQuery(
      `SELECT
         i.id as item_id,
         i.total_quantity,
         i.available_quantity,
         COALESCE(SUM(r.quantity), 0) as committed_quantity
       FROM items i
       LEFT JOIN work_order_stock_reservations r
         ON r.item_id = i.id AND r.status = 'reserved'
       WHERE ${where.join(' AND ')}
       GROUP BY i.id`,
      params
    );
  }

  async updateAvailableQuantity(id, quantity) {
    await runQuery('UPDATE items SET available_quantity = ? WHERE id = ?', [quantity, id]);
  }

  async reserveIfNeeded(workOrderId, status) {
    if (!shouldReserveStock(status)) {
      return { reserved: false, reason: 'status_not_reserved' };
    }

    return await this.reserveWorkOrderStock(workOrderId, status);
  }

  async reserveConduceStockIfNeeded(conduceId, status) {
    if (!shouldDeductStockForConduce(status)) {
      return { reserved: false, reason: 'status_not_deducting' };
    }

    return await this.reserveConduceStock(conduceId, status);
  }

  async reserveConduceStock(conduceId, targetStatus) {
    if (!conduceId) {
      throw new Error('Conduce inválido.');
    }

    await runQuery('BEGIN IMMEDIATE TRANSACTION');

    try {
      const conduce = await getSingleQuery(
        'SELECT id, work_order_id FROM conduces WHERE id = ?',
        [conduceId]
      );

      if (!conduce) {
        throw new Error('Conduce no encontrado.');
      }

      if (!conduce.work_order_id) {
        throw new Error('El conduce no tiene una orden de trabajo asociada.');
      }

      const workOrderId = conduce.work_order_id;

      // ¿Ya descontó ESTE conduce? Idempotencia por conduce: reemitirlo no
      // vuelve a descontar, pero el segundo conduce de la misma orden si
      // descuenta lo suyo.
      const propia = await getSingleQuery(
        `SELECT COUNT(*) as count
         FROM work_order_stock_reservations
         WHERE conduce_id = ? AND status = 'reserved'`,
        [conduceId]
      );

      if ((propia?.count || 0) > 0) {
        await this.updateConduceStatusIfProvided(conduceId, targetStatus);
        await this.updateWorkOrderStatusFromConduce(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'already_reserved' };
      }

      // ¿La ORDEN ya aparto el total al prepararse? Entonces la mercancia esta
      // comprometida y descontarla otra vez al entregar seria duplicarla.
      const deLaOrden = await getSingleQuery(
        `SELECT COUNT(*) as count
         FROM work_order_stock_reservations
         WHERE work_order_id = ? AND conduce_id IS NULL AND status = 'reserved'`,
        [workOrderId]
      );

      if ((deLaOrden?.count || 0) > 0) {
        await this.updateConduceStatusIfProvided(conduceId, targetStatus);
        await this.updateWorkOrderStatusFromConduce(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'covered_by_work_order' };
      }

      const rows = await getQuery(
        `SELECT
           ci.item_id,
           SUM(ci.quantity) as quantity,
           i.name,
           i.internal_code,
           i.available_quantity
         FROM conduce_items ci
         JOIN items i ON ci.item_id = i.id
         WHERE ci.conduce_id = ?
         GROUP BY ci.item_id, i.name, i.internal_code, i.available_quantity`,
        [conduceId]
      );

      if (rows.length === 0) {
        await this.updateConduceStatusIfProvided(conduceId, targetStatus);
        await this.updateWorkOrderStatusFromConduce(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'empty_conduce' };
      }

      const insufficient = findInsufficientStock(rows, rows);
      if (insufficient.length > 0) {
        const detail = formatInsufficientStockDetail(insufficient);
        throw new Error(`Stock insuficiente para emitir el conduce: ${detail}`);
      }

      for (const row of rows) {
        await runQuery(
          `UPDATE items
           SET available_quantity = available_quantity - ?
           WHERE id = ?`,
          [row.quantity, row.item_id]
        );

        await runQuery(
          `INSERT INTO work_order_stock_reservations
            (work_order_id, item_id, conduce_id, quantity, status)
           VALUES (?, ?, ?, ?, 'reserved')`,
          [workOrderId, row.item_id, conduceId, row.quantity]
        );
      }

      await this.updateConduceStatusIfProvided(conduceId, targetStatus);
      await this.updateWorkOrderStatusFromConduce(workOrderId, targetStatus);
      await runQuery('COMMIT');
      return { reserved: true, item_count: rows.length };
    } catch (error) {
      await rollbackQuietly();
      throw error;
    }
  }

  async reserveWorkOrderStock(workOrderId, targetStatus) {
    if (!workOrderId) {
      throw new Error('Orden de trabajo inválida.');
    }

    await runQuery('BEGIN IMMEDIATE TRANSACTION');

    try {
      // `conduce_id IS NULL`: solo cuenta lo que aparto la ORDEN. Si algun
      // conduce ya descontó lo suyo, esas filas no bloquean la reserva de la
      // orden —son cosas distintas— pero tampoco se duplican, porque una orden
      // solo llega a `preparado` una vez.
      const existing = await getSingleQuery(
        `SELECT COUNT(*) as count
         FROM work_order_stock_reservations
         WHERE work_order_id = ? AND conduce_id IS NULL AND status = 'reserved'`,
        [workOrderId]
      );

      if ((existing?.count || 0) > 0) {
        await this.updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'already_reserved' };
      }

      // GROUP BY, igual que la consulta del conduce. Sin el, un articulo que
      // aparezca en dos lineas de la orden se comprobaba por linea (3<=5 y
      // 4<=5, ambas pasan) y luego se descontaba dos veces: 7 de 5, dejando
      // `available_quantity` en negativo, y el segundo INSERT chocaba con el
      // indice unico a media transaccion.
      const rows = await getQuery(
        `SELECT
           wi.item_id,
           SUM(wi.quantity) as quantity,
           i.name,
           i.internal_code,
           i.available_quantity
         FROM work_order_items wi
         JOIN items i ON wi.item_id = i.id
         WHERE wi.work_order_id = ?
         GROUP BY wi.item_id, i.name, i.internal_code, i.available_quantity`,
        [workOrderId]
      );

      if (rows.length === 0) {
        await this.updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'empty_order' };
      }

      const insufficient = findInsufficientStock(rows, rows);
      if (insufficient.length > 0) {
        const detail = formatInsufficientStockDetail(insufficient);
        throw new Error(`Stock insuficiente para reservar: ${detail}`);
      }

      for (const row of rows) {
        await runQuery(
          `UPDATE items
           SET available_quantity = available_quantity - ?
           WHERE id = ?`,
          [row.quantity, row.item_id]
        );

        await runQuery(
          `INSERT INTO work_order_stock_reservations
            (work_order_id, item_id, conduce_id, quantity, status)
           VALUES (?, ?, NULL, ?, 'reserved')`,
          [workOrderId, row.item_id, row.quantity]
        );
      }

      await this.updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
      await runQuery('COMMIT');
      return { reserved: true, item_count: rows.length };
    } catch (error) {
      await rollbackQuietly();
      throw error;
    }
  }

  async updateWorkOrderStatusIfProvided(workOrderId, status) {
    if (!status) return;
    await runQuery('UPDATE work_orders SET status = ? WHERE id = ?', [status, workOrderId]);
  }

  async updateConduceStatusIfProvided(conduceId, status) {
    if (!status) return;
    await runQuery('UPDATE conduces SET status = ? WHERE id = ?', [status, conduceId]);
  }

  async updateWorkOrderStatusFromConduce(workOrderId, status) {
    if (status !== 'entregado') return;
    await this.updateWorkOrderStatusIfProvided(workOrderId, 'entregado');
  }
}

async function rollbackQuietly() {
  return new Promise((resolve) => {
    getDatabase().run('ROLLBACK', () => resolve());
  });
}

const sqliteInventoryRepository = new SqliteInventoryRepository();

module.exports = {
  SqliteInventoryRepository,
  sqliteInventoryRepository
};
