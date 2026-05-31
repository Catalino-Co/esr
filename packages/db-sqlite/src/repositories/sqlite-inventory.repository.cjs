const {
  findInsufficientStock,
  formatInsufficientStockDetail,
  shouldReserveStock
} = require('@esr/core');
const { getDatabase, getQuery, getSingleQuery, runQuery } = require('../connection.cjs');

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

  async reserveWorkOrderStock(workOrderId, targetStatus) {
    if (!workOrderId) {
      throw new Error('Orden de trabajo inválida.');
    }

    await runQuery('BEGIN IMMEDIATE TRANSACTION');

    try {
      const existing = await getSingleQuery(
        `SELECT COUNT(*) as count
         FROM work_order_stock_reservations
         WHERE work_order_id = ? AND status = 'reserved'`,
        [workOrderId]
      );

      if ((existing?.count || 0) > 0) {
        await this.updateWorkOrderStatusIfProvided(workOrderId, targetStatus);
        await runQuery('COMMIT');
        return { reserved: false, reason: 'already_reserved' };
      }

      const rows = await getQuery(
        `SELECT wi.item_id, wi.quantity, i.name, i.internal_code, i.available_quantity
         FROM work_order_items wi
         JOIN items i ON wi.item_id = i.id
         WHERE wi.work_order_id = ?`,
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
            (work_order_id, item_id, quantity, status)
           VALUES (?, ?, ?, 'reserved')`,
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
